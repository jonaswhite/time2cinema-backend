import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisplayMovie } from '@/lib/types/movie';
import { formatDate } from '@/lib/utils/format';
import { fetchTmdbPoster } from '@/lib/tmdb';

interface MovieCardProps {
  movie: DisplayMovie;
  showRank?: boolean;
  showSales?: boolean;
}

// Base64 encoded SVG placeholder as a data URL
const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMzAwIiBzdHlsZT0iYmFja2dyb3VuZC1jb2xvcjojMjIyOyI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gUG9zdGVyIEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';

const MovieCard: React.FC<MovieCardProps> = ({ 
  movie, 
  showRank = false, 
  showSales = false 
}) => {
  const [currentPosterUrl, setCurrentPosterUrl] = useState<string>(movie.poster || placeholderImage);
  const [isLoadingTmdb, setIsLoadingTmdb] = useState<boolean>(false);

  useEffect(() => {
    const loadPoster = async () => {
      if ((!movie.poster || movie.poster === placeholderImage) && !isLoadingTmdb) {
        setIsLoadingTmdb(true);
        try {
          const tmdbPoster = await fetchTmdbPoster(
            { 
              chinese_title: movie.chinese_title, 
              english_title: movie.english_title,
              full_title: movie.full_title 
            },
            movie.tmdb_id
          );
          if (tmdbPoster) {
            setCurrentPosterUrl(tmdbPoster);
          } else {
            // If TMDB also doesn't find it, ensure placeholder is used if movie.poster was initially null/empty
            if (!movie.poster) {
              setCurrentPosterUrl(placeholderImage);
            }
          }
        } catch (error) {
          console.error("Error fetching TMDB poster for MovieCard:", movie.display_title, error);
          if (!movie.poster) {
            setCurrentPosterUrl(placeholderImage); // Fallback to placeholder on error
          }
        } finally {
          setIsLoadingTmdb(false);
        }
      } else if (movie.poster && movie.poster !== placeholderImage) {
        // If movie.poster has a valid value (and not the placeholder itself), use it directly
        setCurrentPosterUrl(movie.poster);
      } else if (!movie.poster && currentPosterUrl !== placeholderImage) {
        // If movie.poster is null/empty, but currentPosterUrl somehow isn't placeholder (e.g. from previous render), reset to placeholder
        setCurrentPosterUrl(placeholderImage);
      }
    };

    loadPoster();
  }, [movie.poster, movie.display_title, movie.full_title, movie.chinese_title, movie.english_title]); // Removed isLoadingTmdb and currentPosterUrl from deps to avoid re-triggering on its own state updates

  
  return (
    <Link href={`/showtimes/${encodeURIComponent(movie.display_title)}`} className="block w-full">
      <div className="bg-card/80 hover:bg-card/100 transition-colors rounded-md overflow-hidden shadow-sm flex flex-row h-[120px] w-full border border-border/20 cursor-pointer">
      {/* 電影海報 */}
      <div className="relative w-[80px] flex-shrink-0">
        {/* 排名標籤 - 只顯示前10名 */}
        {showRank && movie.rank && movie.rank <= 10 && (
          <div className="absolute top-0 left-0 bg-black/70 text-white px-1.5 py-0.5 rounded-br text-xs font-medium z-10">
            {movie.rank}
          </div>
        )}
        <img
          src={currentPosterUrl}
          alt={movie.display_title}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            // Only set to placeholder if it's not already the placeholder, to prevent potential loop if placeholder itself fails (though unlikely for data URI)
            if (target.src !== placeholderImage) {
              target.src = placeholderImage;
            }
          }}
        />
      </div>
      
      {/* 電影資訊 */}
      <div className="py-3 px-4 flex flex-col justify-between flex-1">
        <div>
          <h3 className="text-base font-medium mb-1 line-clamp-1">{movie.display_title}</h3>
          <p className="text-xs text-muted-foreground">上映日：{formatDate(movie.releaseDate) || '未定'}</p>
        </div>
        
        <div>
          {movie.runtime && (
            <p className="text-xs text-muted-foreground">片長：{movie.runtime} 分鐘</p>
          )}
          
          {/* 票房資訊 */}
          {showSales && movie.weeklySales && (
            <div className="mt-1">
              <Badge variant="outline" className="text-xs py-0 px-1.5 h-5">
                週票房: {movie.weeklySales}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
    </Link>
  );
};

export default MovieCard;
