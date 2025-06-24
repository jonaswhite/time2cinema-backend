#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import logging
import os
import re
import sys
import datetime
from typing import Dict, List, Any, Optional
from urllib.parse import urljoin
from dotenv import load_dotenv

from common.scraping_utils import BaseScraper
from common.db_handler import DatabaseHandler
import common.movie_utils as movie_utils
from title_utils import split_chinese_english

# --- Configuration ---
# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env')
load_dotenv(dotenv_path)

# Setup logging
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output', 'scrapers')
os.makedirs(OUTPUT_DIR, exist_ok=True)

log_file = os.path.join(OUTPUT_DIR, 'atmovies_movie_scraper_v2.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, mode='w')
    ]
)
logger = logging.getLogger(__name__)

# --- Constants ---
BASE_URL = "https://www.atmovies.com.tw/"
FIRST_RUN_URL = "https://www.atmovies.com.tw/movie/now/1/"
SECOND_RUN_URL = "https://www.atmovies.com.tw/movie/now2/1/"
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    logger.error("DATABASE_URL environment variable not set.")
    sys.exit(1)

class ATMoviesMovieScraper(BaseScraper):
    """Scraper for ATMovies, focusing on currently showing movies."""

    def __init__(self):
        super().__init__()
        self.movies: List[Dict[str, Any]] = []
        self.processed_urls: set[str] = set()

    def _parse_movies_from_soup(self, soup: Any, page_url: str) -> List[Dict[str, Any]]:
        """Parses movie data from a BeautifulSoup object, handling multiple layouts."""
        movie_list = []
        
        # Layout 1: Main page dynamic content (#theater-list > .box)
        film_list_items = soup.select('#theater-list > .box')
        if film_list_items:
            logger.debug(f"Using layout 1 (#theater-list > .box) for {page_url}")
            for item in film_list_items:
                title_tag = item.select_one('h3 a')
                if not title_tag or not title_tag.get('href'): continue

                movie_url = urljoin(BASE_URL, title_tag['href'])
                atmovies_id = movie_utils.extract_movie_id_from_url(movie_url)
                if not movie_utils.is_valid_movie_id(atmovies_id): continue

                full_title = title_tag.text.strip()
                chinese_title, english_title = split_chinese_english(full_title)
                poster_url = item.select_one('.poster img')['src'] if item.select_one('.poster img') else None
                
                runtime, release_date = None, None
                info_list = item.select('ul.info li')
                for i, li in enumerate(info_list):
                    if '片長' in li.text and i + 1 < len(info_list):
                        runtime = movie_utils.parse_runtime(info_list[i+1].text.strip())
                    if '上映日期' in li.text and i + 1 < len(info_list):
                        release_date = movie_utils.parse_release_date(info_list[i+1].text.strip())

                movie_list.append({
                    'atmovies_id': atmovies_id, 'full_title': full_title, 'chinese_title': chinese_title,
                    'english_title': english_title, 'runtime': runtime, 'release_date': release_date,
                    'poster_url': poster_url, 'source_url': movie_url
                })
        else:
            # Layout 2: "More movies" page content (article.filmList)
            film_list_items = soup.select('article.filmList')
            if film_list_items:
                logger.debug(f"Using layout 2 (article.filmList) for {page_url}")
                for item in film_list_items:
                    title_tag = item.select_one('.filmTitle a')
                    if not title_tag or not title_tag.get('href'): continue
                    
                    movie_url = urljoin(BASE_URL, title_tag['href'])
                    atmovies_id = movie_utils.extract_movie_id_from_url(movie_url)
                    if not movie_utils.is_valid_movie_id(atmovies_id): continue

                    full_title = title_tag.text.strip()
                    chinese_title, english_title = split_chinese_english(full_title)
                    poster_url = item.select_one('.image.filmListPoster img')['src'] if item.select_one('.image.filmListPoster img') else None
                    
                    runtime, release_date = None, None
                    runtime_div_text = item.select_one('.runtime').text if item.select_one('.runtime') else ''
                    
                    runtime_match = re.search(r'片長：(\d+分)', runtime_div_text)
                    if runtime_match: runtime = movie_utils.parse_runtime(runtime_match.group(1))
                    
                    release_date_match = re.search(r'上映日期：(\d{1,2}/\d{1,2}/\d{4})', runtime_div_text)
                    if release_date_match: release_date = movie_utils.parse_release_date(release_date_match.group(1))

                    movie_list.append({
                        'atmovies_id': atmovies_id, 'full_title': full_title, 'chinese_title': chinese_title,
                        'english_title': english_title, 'runtime': runtime, 'release_date': release_date,
                        'poster_url': poster_url, 'source_url': movie_url
                    })

        logger.info(f"Parsed {len(movie_list)} movies from {page_url}")
        return movie_list

    async def _scrape_movie_list_recursively(self, page_url: str) -> List[Dict[str, Any]]:
        """Recursively scrapes movie lists, following the 'more' button."""
        if page_url in self.processed_urls:
            logger.info(f"Skipping already processed URL: {page_url}")
            return []
        self.processed_urls.add(page_url)

        soup = await self.fetch_page(page_url)
        if not soup:
            return []

        movies = self._parse_movies_from_soup(soup, page_url)

        more_button = soup.select_one(".listTab a[onclick*='grabFile']")
        if more_button and (onclick := more_button.get('onclick')):
            if url_match := re.search(r"grabFile\('([^']*)',[^)]*\)", onclick):
                more_url = urljoin(BASE_URL, url_match.group(1))
                logger.info(f"Found 'more movies' button, fetching from: {more_url}")
                movies.extend(await self._scrape_movie_list_recursively(more_url))

        return movies

    async def run(self, output_format: str = 'json', skip_db: bool = False) -> bool:
        """Executes the main scraping process."""
        try:
            logger.info("--- Starting ATMovies Scraper ---")

            tasks = [
                self._scrape_movie_list_recursively(FIRST_RUN_URL),
                self._scrape_movie_list_recursively(SECOND_RUN_URL)
            ]
            results = await asyncio.gather(*tasks)

            # Combine and remove duplicates
            all_movies_dict = {m['atmovies_id']: m for movies in results for m in movies}
            self.movies = list(all_movies_dict.values())

            total_movies = len(self.movies)
            if total_movies == 0:
                logger.warning("No movies found. Exiting.")
                return True

            logger.info(f"Total unique movies found: {total_movies}")

            if not skip_db:
                async with DatabaseHandler(DATABASE_URL) as db_handler:
                    saved_count = await db_handler.save_movies_batch(self.movies)
                    logger.info(f"Database operation completed. {saved_count}/{total_movies} movies were upserted.")
            else:
                logger.info("Skipping database save as requested.")

            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = os.path.join(OUTPUT_DIR, f"atmovies_movies_{timestamp}.{output_format}")
            await self.save_to_json(self.movies, filename)

            logger.info(f"--- ATMovies Scraper Finished ---")
            return True

        except Exception as e:
            logger.critical(f"A critical error occurred during scraping: {e}", exc_info=True)
            return False

async def main(output_format: str = 'json', skip_db: bool = False):
    """Main function to run the scraper."""
    async with ATMoviesMovieScraper() as scraper:
        success = await scraper.run(output_format=output_format, skip_db=skip_db)
        if not success:
            logger.error("Scraper run failed.")
            sys.exit(1)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='ATMovies Movie Scraper')
    parser.add_argument('--format', type=str, default='json', choices=['json'], help='Output format (currently only json is supported).')
    parser.add_argument('--skip-db', action='store_true', help='Skip database operations.')
    args = parser.parse_args()

    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    asyncio.run(main(args.format, args.skip_db))
