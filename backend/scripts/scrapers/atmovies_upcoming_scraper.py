import asyncio
import logging
import os
import sys
import argparse
import json
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Add the script's directory to the Python path to resolve local imports
# This is crucial for running the script in different environments (e.g., CI/CD)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from common.scraping_utils import BaseScraper
from common import movie_utils
from common.db_handler import DatabaseHandler

# Load environment variables from the project root
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env')
load_dotenv(dotenv_path)

# Setup logging
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output', 'scrapers')
os.makedirs(OUTPUT_DIR, exist_ok=True)

log_file = os.path.join(OUTPUT_DIR, 'atmovies_upcoming_scraper.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, mode='w')
    ]
)
logger = logging.getLogger(__name__)


class ATMoviesUpcomingScraper(BaseScraper):
    """
    Scraper for upcoming movies from ATMovies.
    It fetches all movie detail pages by first collecting links from the main and weekly list pages.
    """

    def __init__(self):
        super().__init__()
        self.base_url = "https://www.atmovies.com.tw"
        self.start_url = f"{self.base_url}/movie/next/"

    async def fetch_pages(self, urls: list[str]) -> list[BeautifulSoup | None]:
        """Fetches multiple pages concurrently and returns their soup objects."""
        tasks = [self.fetch_page(url) for url in urls]
        return await asyncio.gather(*tasks)

    async def run(self, skip_db=False):
        """Main function to run the scraper."""
        logger.info(f"Starting scraper, base URL: {self.start_url}")

        # 1. Collect all unique movie detail page URLs
        logger.info("Collecting movie detail URLs from main and weekly pages...")
        main_page_soup = await self.fetch_page(self.start_url)
        if not main_page_soup:
            logger.error("Failed to fetch main page, aborting.")
            return []

        list_page_urls = self._get_list_page_urls(main_page_soup)
        list_page_soups = await self.fetch_pages(list(list_page_urls))

        detail_urls = self._get_detail_page_urls(main_page_soup, list_page_soups)
        logger.info(f"Found {len(detail_urls)} unique movie detail pages to scrape.")

        # 2. Fetch and parse each detail page
        if not detail_urls:
            logger.info("No movie detail pages found.")
            return []

        detail_urls_list = list(detail_urls)
        soups = await self.fetch_pages(detail_urls_list)

        all_movies = []
        for i, soup in enumerate(soups):
            if soup:
                url = detail_urls_list[i]
                movie_data = self._parse_movie_detail_page(soup, url)
                if movie_data:
                    all_movies.append(movie_data)

        logger.info(f"Successfully parsed {len(all_movies)} unique upcoming movies.")

        # 3. Save results
        if all_movies:
            await self.save_to_json(all_movies, "atmovies_upcoming")
            if not skip_db:
                db_url = os.getenv('DATABASE_URL')
                if not db_url:
                    logger.error("DATABASE_URL not set, skipping DB operations.")
                else:
                    async with DatabaseHandler(db_url) as db_handler:
                        await db_handler.save_movies_batch(all_movies)

        return all_movies

    def _get_list_page_urls(self, main_page_soup: BeautifulSoup) -> set[str]:
        """Parses all weekly list page URLs from the main upcoming page's soup."""
        urls = {self.start_url}
        date_links = main_page_soup.select('a[href*="/movie/next/w"]')
        for link in date_links:
            href = link.get('href')
            if href:
                full_url = urljoin(self.base_url, href)
                urls.add(full_url)
        logger.info(f"Found {len(urls)} unique list pages to scrape (including main page).")
        return urls

    def _get_detail_page_urls(self, main_page_soup: BeautifulSoup, list_page_soups: list[BeautifulSoup]) -> set[str]:
        """Parses all unique movie detail page URLs from the main and weekly list pages."""
        detail_urls = set()
        all_soups = [main_page_soup] + [s for s in list_page_soups if s]
        for soup in all_soups:
            links = soup.select('a[href*="/movie/f"]')
            for link in links:
                href = link.get('href')
                if href:
                    full_url = urljoin(self.base_url, href)
                    if movie_utils.extract_movie_id_from_url(full_url):
                        detail_urls.add(full_url)
        return detail_urls

    def _parse_movie_detail_page(self, soup: BeautifulSoup, url: str) -> dict | None:
        """Parses all movie data from a movie's detail page soup."""
        try:
            atmovies_id = movie_utils.extract_movie_id_from_url(url)
            if not atmovies_id:
                logger.warning(f"Could not extract atmovies_id from detail page url {url}")
                return None

            # The title is in a div with a specific class name (with a typo)
            title_tag = soup.select_one("div.filmTittle")
            if title_tag:
                # The text is separated by <br>, get_text with a separator handles this
                full_title = title_tag.get_text(separator=" ", strip=True)
            else:
                # Fallback to the page title if the div is not found
                full_title = soup.title.string.strip() if soup.title else ""
                # Clean up the page title
                if "@movies" in full_title:
                    full_title = full_title.split("@movies")[0].strip()

            title_chinese, title_english = movie_utils.split_chinese_english(full_title)

            poster_element = soup.select_one("meta[property='og:image']")
            poster_url = poster_element['content'] if poster_element else ""

            film_info_text = ""
            film_info_div = soup.select_one(".film_info_group")
            if film_info_div:
                film_info_text = film_info_div.text
            else:
                li_elements = soup.select("ul > li")
                for li in li_elements:
                    if "上映日期" in li.text or "片長" in li.text:
                        film_info_text += li.text + "\n"

            if not film_info_text:
                og_desc = soup.select_one("meta[property='og:description']")
                if og_desc:
                    film_info_text = og_desc['content']

            release_date = movie_utils.parse_release_date_from_text(film_info_text)
            runtime = movie_utils.parse_runtime_from_atmovies_text(film_info_text)

            return {
                "atmovies_id": atmovies_id,
                "chinese_title": title_chinese,
                "english_title": title_english,
                "full_title": full_title,
                "release_date": release_date,
                "runtime": runtime,
                "poster_url": poster_url,
                "source_url": url,
            }
        except Exception as e:
            logger.error(f"Error parsing detail page {url}: {e}", exc_info=True)
            return None

    async def save_to_json(self, data, file_prefix):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{file_prefix}_{timestamp}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            logger.info(f"Data successfully saved to {filepath}")
        except IOError as e:
            logger.error(f"Failed to save data to {filepath}: {e}")


async def main(skip_db: bool = False):
    """Main function to create and run the scraper."""
    async with ATMoviesUpcomingScraper() as scraper:
        await scraper.run(skip_db=skip_db)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='ATMovies Upcoming Movies Scraper')
    parser.add_argument('--skip-db', action='store_true', help='Skip database operations.')
    args = parser.parse_args()

    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    asyncio.run(main(skip_db=args.skip_db))
