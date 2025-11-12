export const sortByDiscAndTrack = (a: any, b: any) => {
  const ad = a.ParentIndexNumber ?? a.Disc ?? a.ParentIndex ?? 0;
  const bd = b.ParentIndexNumber ?? b.Disc ?? b.ParentIndex ?? 0;
  if (ad !== bd) return ad - bd;

  const at = a.IndexNumber ?? a.Track ?? 0;
  const bt = b.IndexNumber ?? b.Track ?? 0;
  return at - bt;
};
