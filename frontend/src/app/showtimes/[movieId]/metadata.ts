import { Metadata, ResolvingMetadata } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';

type Props = {
  params: { movieId: string }
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const movieId = params.movieId;
  const decodedMovieId = movieId ? decodeURIComponent(movieId) : "";
  
  // 從後端 API 獲取電影資料
  let movieData = null;
  try {
    const response = await fetch(`${API_URL}/api/movies/name/${encodeURIComponent(decodedMovieId)}`);
    if (response.ok) {
      movieData = await response.json();
    }
  } catch (error) {
    console.error('Error fetching movie data for metadata:', error);
  }
  
  // 準備 meta 標籤內容
  const title = movieData?.chinese_title || movieData?.full_title || decodedMovieId || '電影資訊';
  const description = movieData?.overview || `查看 ${title} 的場次資訊`;
  const posterUrl = movieData?.poster_url || '';
  
  // 獲取基礎 URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const pageUrl = `${baseUrl}/showtimes/${encodeURIComponent(decodedMovieId)}`;
  
  return {
    title: `${title} | 電影場次 | Time2Cinema`,
    description: description,
    openGraph: {
      title: `${title} | Time2Cinema`,
      description: description,
      type: 'website',
      url: pageUrl,
      images: posterUrl ? [{
        url: posterUrl,
        width: 500,
        height: 750,
        alt: title,
      }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Time2Cinema`,
      description: description,
      images: posterUrl ? [posterUrl] : [],
    },
  };
}
