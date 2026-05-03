import AMapLoader from '@amap/amap-jsapi-loader';

let AMapInstance: any = null;
let loadingPromise: Promise<any> | null = null;

export async function loadAMap(): Promise<any> {
  if (AMapInstance) return AMapInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = AMapLoader.load({
    key: import.meta.env.VITE_GAODE_KEY || 'your-gaode-key',
    version: '2.0',
    plugins: ['AMap.Geolocation', 'AMap.MarkerClusterer', 'AMap.CircleEditor'],
  }).then((AMap) => {
    AMapInstance = AMap;
    return AMap;
  });

  return loadingPromise;
}

export function getAMap() {
  return AMapInstance;
}
