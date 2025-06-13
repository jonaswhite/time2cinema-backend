const TMDB_API_KEY = "d4c9092656c3aa3cfa5761fbf093f7d0";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

interface TmdbMovieSearchResult {
  id: number;
  poster_path: string | null;
  title?: string;
  original_title?: string;
}

interface TmdbSearchResponse {
  results: TmdbMovieSearchResult[];
}

/**
 * Fetches a movie poster URL from TMDB.
 * Tries to find a match using originalMovieName first, then movieName.
 * @param movieName The primary (e.g., localized) movie name.
 * @param originalMovieName The original movie name (e.g., English title), optional.
 * @returns A fully qualified URL to the TMDB poster image, or null if not found.
 */
interface FetchPosterParams {
  full_title?: string | null;
  chinese_title?: string | null;
  english_title?: string | null;
}

export async function fetchTmdbPoster(
  params: FetchPosterParams,
  tmdbId?: number | string | null
): Promise<string | null> {
  if (!TMDB_API_KEY) {
    console.error("TMDB API key is not configured.");
    return null;
  }

  if (!TMDB_API_KEY) {
    console.error("TMDB API key is not configured.");
    return null;
  }

  console.log(`[fetchTmdbPoster] Called with params: ${JSON.stringify(params)}, tmdbId: ${tmdbId}`);

  // Helper function to search by title and language
  const fetchPosterByTitleAndLanguage = async (title: string, lang: string): Promise<string | null> => {
    console.log(`[fetchTmdbPoster] fetchPosterByTitleAndLanguage called with title: '${title}', lang: '${lang}'`);
    if (!title || title.trim() === "") return null;
    try {
      const searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title.trim())}&language=${lang}&include_adult=false`;
      console.log(`[fetchTmdbPoster] fetchPosterByTitleAndLanguage: Search URL: ${searchUrl}`);
      const response = await fetch(searchUrl);
      if (!response.ok) {
        console.error(`TMDB API error for title "${title}" (lang: ${lang}): ${response.status} ${response.statusText}`);
        return null;
      }
      const data: TmdbSearchResponse = await response.json();
      console.log(`[fetchTmdbPoster] fetchPosterByTitleAndLanguage: Search results for title "${title}" (lang: ${lang}): ${JSON.stringify(data)}`);
      if (data.results && data.results.length > 0) {
        const movieWithPoster = data.results.find(movie => movie.poster_path);
        if (movieWithPoster && movieWithPoster.poster_path) {
          console.log(`[fetchTmdbPoster] fetchPosterByTitleAndLanguage: Found poster for movie '${movieWithPoster.title}', path: ${movieWithPoster.poster_path}`);
          return `${TMDB_IMAGE_BASE_URL}${movieWithPoster.poster_path}`;
        }
      }
    } catch (error) {
      console.error(`Error fetching or parsing TMDB data for title "${title}" (lang: ${lang}):`, error);
    }
    return null;
  };

  // Helper function to get images by TMDB ID and language
  const fetchPosterByIdAndLanguage = async (id: number | string, lang?: string): Promise<string | null> => {
    console.log(`[fetchTmdbPoster] fetchPosterByIdAndLanguage called with id: ${id}, lang: ${lang || 'any'}`);
    try {
      let imagesUrl = `${TMDB_BASE_URL}/movie/${id}/images?api_key=${TMDB_API_KEY}`;
      if (lang) {
        imagesUrl += `&language=${lang}`;
      }
      console.log(`[fetchTmdbPoster] fetchPosterByIdAndLanguage: Images URL: ${imagesUrl}`);
      const response = await fetch(imagesUrl);
      if (!response.ok) {
        console.error(`TMDB API error for movie ID "${id}" (lang: ${lang || 'any'}): ${response.status} ${response.statusText}`);
        return null;
      }
      const data = await response.json(); // Type can be more specific if needed
      console.log(`[fetchTmdbPoster] fetchPosterByIdAndLanguage: Images data for ID "${id}" (lang: ${lang || 'any'}): ${JSON.stringify(data)}`);
      // For /images endpoint, posters are in data.posters array
      if (data.posters && data.posters.length > 0) {
        // Prefer posters matching the exact language, or take the first one if no lang specified
        const targetPoster = lang 
          ? data.posters.find((p: any) => p.iso_639_1 === lang && p.file_path)
          : null;
        const bestPoster = targetPoster || data.posters.find((p: any) => p.file_path); // Fallback to first available
        
        if (bestPoster && bestPoster.file_path) {
          console.log(`[fetchTmdbPoster] fetchPosterByIdAndLanguage: Found poster for ID "${id}" (lang: ${lang || 'any'}): lang=${bestPoster.iso_639_1}, path=${bestPoster.file_path}`);
          return `${TMDB_IMAGE_BASE_URL}${bestPoster.file_path}`;
        }
      }
    } catch (error) {
      console.error(`Error fetching or parsing TMDB images for ID "${id}" (lang: ${lang || 'any'}):`, error);
    }
    return null;
  };

  // --- Attempt sequence ---
  let posterUrl: string | null = null;

  // 1. Try with TMDB ID if available
  if (tmdbId) {
    console.log(`[fetchTmdbPoster] Trying with TMDB ID: ${tmdbId}`);
    // 1a. Original language (implicit by not specifying lang, TMDB tends to return original/best)
    // console.log(`[TMDB Poster] Attempting ID ${tmdbId} (Original/Best)`);
    posterUrl = await fetchPosterByIdAndLanguage(tmdbId);
    if (posterUrl) {
      console.log(`[fetchTmdbPoster] Found poster (original/any lang) by ID ${tmdbId}: ${posterUrl}`);
      return posterUrl;
    }

    // 1b. English
    // console.log(`[TMDB Poster] Attempting ID ${tmdbId} (English)`);
    posterUrl = await fetchPosterByIdAndLanguage(tmdbId, 'en');
    if (posterUrl) {
      console.log(`[fetchTmdbPoster] Found poster (English) by ID ${tmdbId}: ${posterUrl}`);
      return posterUrl;
    }

    // 1c. Chinese (zh-TW)
    // console.log(`[TMDB Poster] Attempting ID ${tmdbId} (Chinese)`);
    posterUrl = await fetchPosterByIdAndLanguage(tmdbId, 'zh-TW'); // Assuming zh-TW for Chinese
    if (posterUrl) {
      console.log(`[fetchTmdbPoster] Found poster (Chinese) by ID ${tmdbId}: ${posterUrl}`);
      return posterUrl;
    }
  }

  // 2. Try with titles if TMDB ID attempts failed or ID not available
  const { english_title, chinese_title, full_title } = params;

  // 2a. English title
  if (english_title) {
    // console.log(`[TMDB Poster] Attempting title search (English): ${english_title}`);
    posterUrl = await fetchPosterByTitleAndLanguage(english_title, 'en');
    if (posterUrl) return posterUrl;
  }

  // 2b. Chinese title
  if (chinese_title) {
    posterUrl = await fetchPosterByTitleAndLanguage(chinese_title, 'zh-TW');
    if (posterUrl) return posterUrl;
  }

  // 2c. Full title (could be original, often good for zh-TW search too if it's the primary Chinese title)
  if (full_title && full_title !== chinese_title && full_title !== english_title) { 
    posterUrl = await fetchPosterByTitleAndLanguage(full_title, 'zh-TW'); 
    if (posterUrl) return posterUrl;
  }
  
  return null;
}
