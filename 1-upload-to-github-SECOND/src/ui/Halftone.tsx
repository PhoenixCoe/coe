/** Comic-book dots: big ones in a corner, shrinking until they melt into the page. Three sizes of one dot grid, each fading in as the last fades out, so there is no edge anywhere. */
export function Halftone({ className = '' }: { className?: string }) {
  return <div className={`ht ${className}`} aria-hidden><i /><i /><i /></div>;
}
