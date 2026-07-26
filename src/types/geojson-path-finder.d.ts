declare module 'geojson-path-finder' {
  import { FeatureCollection, Feature, Point } from 'geojson';

  interface PathFinderOptions {
    precision?: number;
    weightFn?: (a: number[], b: number[]) => number;
    edgeDataReduceFn?: (accumulated: any, edge: any) => any;
    edgeDataSeed?: any;
  }

  interface PathResult {
    path: [number, number][];
    weight: number;
    edgeDatas?: any[];
  }

  class PathFinder {
    constructor(geojson: FeatureCollection, options?: PathFinderOptions);
    findPath(start: Feature<Point> | number[] | Point, end: Feature<Point> | number[] | Point): PathResult | null;
  }

  export default PathFinder;
}
