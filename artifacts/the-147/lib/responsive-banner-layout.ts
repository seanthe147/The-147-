const BANNER_ASPECT_RATIO = 2.3;

export function getBannerFrame(windowWidth: number, horizontalInset = 0) {
  const width = Math.max(0, windowWidth - horizontalInset);
  return {
    width,
    height: Math.round(width / BANNER_ASPECT_RATIO),
  };
}

export function getBannerPageOffset(index: number, bannerWidth: number, gap = 0) {
  return Math.max(0, index) * (bannerWidth + gap);
}
