import psycopg2
from psycopg2.extras import RealDictCursor
import logging

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("test_movie_update.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 資料庫連接資訊
DB_URL = "postgresql://postgres.bnfplxbaqnmwpjvjwqzx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

def test_movie_update():
    try:
        # 連接資料庫
        conn = psycopg2.connect(DB_URL, sslmode='require', client_encoding='UTF8')
        conn.autocommit = False
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # 測試資料
        test_movies = [
            {
                "chinese_title": "獵金·遊戲",
                "english_title": "A Gilded Game",
                "atmovies_id": "fahk23461006",  # 使用現有的 atmovies_id
                "full_title": "獵金·遊戲 A Gilded Game",
                "source": "atmovies"
            },
            {
                "chinese_title": "雷霆特攻隊",
                "english_title": "Thunderbolts",
                "atmovies_id": "fthd12345678",  # 使用新的測試用 atmovies_id
                "full_title": "雷霆特攻隊* Thunderbolts",
                "source": "tmdb"  # 使用不同來源
            },
            {
                "chinese_title": "不存在的電影",
                "english_title": "Non-existent Movie",
                "atmovies_id": "fxyz12345678",
                "full_title": "不存在的電影 Non-existent Movie",
                "source": "atmovies"
            },
            {
                "chinese_title": "測試電影",
                "english_title": "Test Movie",
                "atmovies_id": "ftst98765432",
                "full_title": "測試電影 Test Movie",
                "source": "atmovies"
            }
        ]
        
        for movie in test_movies:
            logger.info(f"測試電影: {movie['full_title']}")
            
            # 檢查是否已有相同標題的電影
            cursor.execute(
                """
                SELECT id, atmovies_id, source 
                FROM movies 
                WHERE 
                    (chinese_title = %s AND chinese_title IS NOT NULL) OR 
                    (english_title = %s AND english_title IS NOT NULL)
                LIMIT 1
                """,
                (movie["chinese_title"], movie["english_title"])
            )
            existing_movie = cursor.fetchone()
            
            if existing_movie:
                logger.info(f"找到現有電影: ID={existing_movie['id']} atmovies_id={existing_movie['atmovies_id']} source={existing_movie['source']}")
            
            # 如果來源不同，更新來源和 atmovies_id
            if existing_movie and existing_movie['source'] != 'atmovies':
                logger.info(f"更新電影來源從 {existing_movie['source']} 到 atmovies")
                cursor.execute(
                    """
                    UPDATE movies 
                    SET 
                        atmovies_id = %s,
                        source = 'atmovies',
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING id
                    """,
                    (movie["atmovies_id"], existing_movie['id'])
                )
                conn.commit()
                logger.info(f"更新電影來源和 atmovies_id 成功")
            elif existing_movie:
                # 如果已經是 atmovies 來源，只更新 atmovies_id
                if existing_movie['atmovies_id'] != movie['atmovies_id']:
                    logger.info(f"更新 atmovies_id 從 {existing_movie['atmovies_id']} 到 {movie['atmovies_id']}")
                    cursor.execute(
                        """
                        UPDATE movies 
                        SET 
                            atmovies_id = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        RETURNING id
                        """,
                        (movie["atmovies_id"], existing_movie['id'])
                    )
                    conn.commit()
                    logger.info(f"更新 atmovies_id 成功")
                else:
                    logger.info(f"電影已存在且 atmovies_id 相同，無需更新")
            else:
                # 新增電影
                logger.info(f"新增電影: {movie['full_title']}")
                cursor.execute(
                    """
                    INSERT INTO movies (
                        atmovies_id, full_title, chinese_title, english_title, 
                        runtime, release_date, created_at, updated_at, source
                    ) VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW(), 'atmovies')
                    RETURNING id
                    """,
                    (
                        movie["atmovies_id"],
                        movie["full_title"],
                        movie["chinese_title"],
                        movie["english_title"],
                        None,
                        None
                    )
                )
                movie_id = cursor.fetchone()['id']
                conn.commit()
                logger.info(f"新增電影成功: ID={movie_id}")
        
        logger.info("測試完成！")
        
    except Exception as e:
        logger.error(f"測試過程中發生錯誤: {e}")
        if 'conn' in locals():
            conn.rollback()
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    test_movie_update()
