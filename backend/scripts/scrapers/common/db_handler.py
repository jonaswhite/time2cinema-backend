import logging
import asyncpg
from typing import Dict, Any, List

# Configure logger
logger = logging.getLogger(__name__)

class DatabaseHandler:
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.pool = None

    async def __aenter__(self):
        try:
            logger.info("Creating database connection pool...")
            self.pool = await asyncpg.create_pool(self.db_url)
            logger.info("Database connection pool created successfully.")
            return self
        except asyncpg.PostgresError as e:
            logger.error(f"Database connection failed: {e}")
            raise
        except Exception as e:
            logger.error(f"An unexpected error occurred while creating DB pool: {e}")
            raise

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed.")

    async def save_movie(self, movie_data: Dict[str, Any]) -> bool:
        """Saves a single movie to the database (insert or update)."""
        return await self.save_movies_batch([movie_data]) > 0

    async def save_movies_batch(self, movies: List[Dict[str, Any]]) -> int:
        """
        Saves a batch of movies to the database using a single upsert query.
        Returns the number of rows affected.
        """
        if not movies or not self.pool:
            return 0

        insert_cols = [
            'atmovies_id', 'full_title', 'chinese_title', 'english_title',
            'runtime', 'release_date', 'poster_url'
        ]

        data_to_insert = []
        for movie in movies:
            if not movie.get('atmovies_id') or not movie.get('full_title'):
                logger.warning(f"Skipping movie with missing atmovies_id or full_title: {movie.get('full_title')}")
                continue
            data_to_insert.append(tuple(movie.get(col) for col in insert_cols))

        if not data_to_insert:
            logger.info("No valid movie data to save in this batch.")
            return 0

        update_cols = [col for col in insert_cols if col != 'atmovies_id']
        update_assignments = ", ".join([f"{col} = EXCLUDED.{col}" for col in update_cols])
        
        # For asyncpg, placeholders are $1, $2, etc.
        placeholders = ", ".join([f'${i+1}' for i in range(len(insert_cols))])

        query = f"""
            INSERT INTO movies ({', '.join(insert_cols)})
            VALUES ({placeholders})
            ON CONFLICT (atmovies_id) DO UPDATE SET
                {update_assignments},
                updated_at = NOW();
        """

        async with self.pool.acquire() as connection:
            async with connection.transaction():
                try:
                    # Use executemany for batch insertion
                    result = await connection.executemany(query, data_to_insert)
                    # result is a status string like 'INSERT 0 10'
                    count = len(data_to_insert) # executemany doesn't return row count directly
                    logger.info(f"Successfully upserted or processed {count} movies in the database.")
                    return count
                except asyncpg.PostgresError as e:
                    logger.error(f"Database error during batch save: {e}")
                    raise
                except Exception as e:
                    logger.error(f"An unexpected error occurred during batch save: {e}")
                    raise
