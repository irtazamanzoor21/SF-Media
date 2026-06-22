import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageCarouselProps {
  images: string[];
  aspectRatio?: string;
  className?: string;
  onRemove?: (index: number) => void;
  showRemove?: boolean;
}

export function ImageCarousel({ images, aspectRatio, className = "", onRemove, showRemove = false }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (images.length === 0) return null;

  const safeIndex = Math.min(currentIndex, images.length - 1);

  const goToPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(safeIndex);
      if (safeIndex >= images.length - 1 && safeIndex > 0) {
        setCurrentIndex(safeIndex - 1);
      }
    }
  };

  return (
    <div className={`relative group ${className}`}>
      <img
        src={images[safeIndex]}
        alt={`Image ${safeIndex + 1} of ${images.length}`}
        className="w-full object-contain rounded-md"
        style={aspectRatio ? { aspectRatio } : undefined}
        data-testid={`img-carousel-${safeIndex}`}
      />

      {showRemove && onRemove && (
        <button
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleRemove}
          data-testid={`button-remove-image-${safeIndex}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {images.length > 1 && (
        <>
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={goToPrev}
            data-testid="button-carousel-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={goToNext}
            data-testid="button-carousel-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
                className={`h-2 rounded-full transition-all ${
                  i === safeIndex
                    ? "bg-white w-4"
                    : "bg-white/50 w-2"
                }`}
                data-testid={`button-carousel-dot-${i}`}
              />
            ))}
          </div>

          <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
            {safeIndex + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
