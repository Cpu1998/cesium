import {
  Math as CesiumMath,
  Cartesian3,
  Color,
  Point3D,
  Point3DCollection,
  Polyline3D,
  Polyline3DCollection,
  Polygon3D,
  Polygon3DCollection,
} from "../../index.js";

const EPS = CesiumMath.EPSILON8;

describe("Point3DCollection", () => {
  const position = new Cartesian3();

  it("batchId", () => {
    const collection = new Point3DCollection();
    const point = new Point3D();

    collection.add({}, point);
    collection.add({}, point);
    collection.add({}, point);

    expect(Point3D.fromCollection(collection, 0, point).batchId).toBe(0);
    expect(Point3D.fromCollection(collection, 1, point).batchId).toBe(1);
    expect(Point3D.fromCollection(collection, 2, point).batchId).toBe(2);
  });

  it("position", () => {
    const collection = new Point3DCollection();
    const point = new Point3D();

    collection.add({ position: Cartesian3.UNIT_X }, point);
    collection.add({ position: Cartesian3.UNIT_Y }, point);
    collection.add({ position: Cartesian3.UNIT_Z }, point);

    Point3D.fromCollection(collection, 0, point);
    expect(point.getPosition(position)).toEqualEpsilon(Cartesian3.UNIT_X, EPS);

    Point3D.fromCollection(collection, 1, point);
    expect(point.getPosition(position)).toEqualEpsilon(Cartesian3.UNIT_Y, EPS);

    Point3D.fromCollection(collection, 2, point);
    expect(point.getPosition(position)).toEqualEpsilon(Cartesian3.UNIT_Z, EPS);
  });

  it("show", () => {
    const collection = new Point3DCollection();
    const point = new Point3D();

    collection.add({ show: true }, point);
    collection.add({ show: false }, point);

    expect(Point3D.fromCollection(collection, 0, point).show).toBe(true);
    expect(Point3D.fromCollection(collection, 1, point).show).toBe(false);
  });

  it("color", () => {
    const collection = new Point3DCollection();
    const point = new Point3D();

    collection.add({ color: Color.RED }, point);
    collection.add({ color: Color.GREEN }, point);
    collection.add({ color: Color.BLUE }, point);

    Point3D.fromCollection(collection, 0, point);
    expect(point.color).toEqualEpsilon(Color.RED, EPS);
    Point3D.fromCollection(collection, 1, point);
    expect(point.color).toEqualEpsilon(Color.GREEN, EPS);
    Point3D.fromCollection(collection, 2, point);
    expect(point.color).toEqualEpsilon(Color.BLUE, EPS);
  });
});

describe("Polyline3DCollection", () => {
  it("batchId", () => {
    const collection = new Polyline3DCollection();
    const polyline = new Polyline3D();

    collection.add({}, polyline);
    collection.add({}, polyline);
    collection.add({}, polyline);

    expect(Polyline3D.fromCollection(collection, 0, polyline).batchId).toBe(0);
    expect(Polyline3D.fromCollection(collection, 1, polyline).batchId).toBe(1);
    expect(Polyline3D.fromCollection(collection, 2, polyline).batchId).toBe(2);
  });

  it("positions", () => {
    const collection = new Polyline3DCollection();
    const polyline = new Polyline3D();

    const positions1 = new Float64Array([0, 0, 0, 0, 0, 1, 0, 0, 2]);
    const positions2 = new Float64Array([0, 1, 0, 0, 1, 1, 0, 1, 2]);
    const positions3 = new Float64Array([0, 2, 0, 0, 2, 1, 0, 2, 2]);
    const positionsScratch = new Float64Array(positions1.length);

    collection.add({ positions: positions1 }, polyline);
    collection.add({ positions: positions2 }, polyline);
    collection.add({ positions: positions3 }, polyline);

    Polyline3D.fromCollection(collection, 0, polyline);
    expect(polyline.getPositions(positionsScratch)).toEqualEpsilon(
      positions1,
      EPS,
    );

    Polyline3D.fromCollection(collection, 1, polyline);
    expect(polyline.getPositions(positionsScratch)).toEqualEpsilon(
      positions2,
      EPS,
    );

    Polyline3D.fromCollection(collection, 2, polyline);
    expect(polyline.getPositions(positionsScratch)).toEqualEpsilon(
      positions3,
      EPS,
    );
  });

  it("show", () => {
    const collection = new Polyline3DCollection();
    const polyline = new Polyline3D();

    collection.add({ show: true }, polyline);
    collection.add({ show: false }, polyline);

    expect(Polyline3D.fromCollection(collection, 0, polyline).show).toBe(true);
    expect(Polyline3D.fromCollection(collection, 1, polyline).show).toBe(false);
  });

  it("color", () => {
    const collection = new Polyline3DCollection();
    const polyline = new Polyline3D();

    collection.add({ color: Color.RED }, polyline);
    collection.add({ color: Color.GREEN }, polyline);
    collection.add({ color: Color.BLUE }, polyline);

    Polyline3D.fromCollection(collection, 0, polyline);
    expect(polyline.color).toEqualEpsilon(Color.RED, EPS);
    Polyline3D.fromCollection(collection, 1, polyline);
    expect(polyline.color).toEqualEpsilon(Color.GREEN, EPS);
    Polyline3D.fromCollection(collection, 2, polyline);
    expect(polyline.color).toEqualEpsilon(Color.BLUE, EPS);
  });
});

describe("Polygon3DCollection", () => {
  it("batchId", () => {
    const collection = new Polygon3DCollection();
    const polygon = new Polygon3D();

    collection.add({}, polygon);
    collection.add({}, polygon);
    collection.add({}, polygon);

    expect(Polygon3D.fromCollection(collection, 0, polygon).batchId).toBe(0);
    expect(Polygon3D.fromCollection(collection, 1, polygon).batchId).toBe(1);
    expect(Polygon3D.fromCollection(collection, 2, polygon).batchId).toBe(2);
  });

  it("positions", () => {
    const collection = new Polygon3DCollection();
    const polygon = new Polygon3D();

    const positions1 = new Float64Array([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    const positions2 = new Float64Array([20, 21, 22, 23, 24, 25]);
    const positions3 = new Float64Array([30, 31, 32, 33, 34, 35, 36, 37, 38]);

    collection.add({ positions: positions1 }, polygon);
    collection.add({ positions: positions2 }, polygon);
    collection.add({ positions: positions3 }, polygon);

    Polygon3D.fromCollection(collection, 0, polygon);
    expect(polygon.getVertexCount(), 3);
    expect(polygon.getPositions(new Float64Array(9))).toEqualEpsilon(
      positions1,
      EPS,
    );

    Polygon3D.fromCollection(collection, 1, polygon);
    expect(polygon.getVertexCount(), 2);
    expect(polygon.getPositions(new Float64Array(6))).toEqualEpsilon(
      positions2,
      EPS,
    );

    Polygon3D.fromCollection(collection, 2, polygon);
    expect(polygon.getVertexCount(), 3);
    expect(polygon.getPositions(new Float64Array(9))).toEqualEpsilon(
      positions3,
      EPS,
    );
  });

  it("holes", () => {
    const collection = new Polygon3DCollection({
      maxPositionCount: 8,
      maxHoleCount: 3,
    });
    const polygon = new Polygon3D();

    const positions1 = new Float64Array([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    const positions2 = new Float64Array([20, 21, 22, 23, 24, 25]);
    const positions3 = new Float64Array([30, 31, 32, 33, 34, 35, 36, 37, 38]);

    const holes2 = new Uint32Array([12, 24]);
    const holes3 = new Uint32Array([16]);

    collection.add({ positions: positions1 }, polygon);
    collection.add({ positions: positions2, holes: holes2 }, polygon);
    collection.add({ positions: positions3, holes: holes3 }, polygon);

    Polygon3D.fromCollection(collection, 0, polygon);
    expect(polygon.getHoleCount(), 0);

    Polygon3D.fromCollection(collection, 1, polygon);
    expect(polygon.getHoleCount(), 2);
    expect(polygon.getHoles(new Uint32Array(2))).toEqualEpsilon(holes2, EPS);

    Polygon3D.fromCollection(collection, 2, polygon);
    expect(polygon.getHoleCount(), 1);
    expect(polygon.getHoles(new Uint32Array(1))).toEqualEpsilon(holes3, EPS);
  });

  it("triangles", () => {
    const collection = new Polygon3DCollection({
      maxPositionCount: (24 + 30 + 15) / 3,
      maxHoleCount: 0,
      maxTriangleCount: 4,
    });
    const polygon = new Polygon3D();

    const positions1 = new Float64Array(24).fill(1);
    const positions2 = new Float64Array(30).fill(2);
    const positions3 = new Float64Array(15).fill(3);

    const triangles1 = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const triangles2 = new Uint32Array([6, 7, 8]);
    const triangles3 = new Uint32Array([0, 2, 4]);

    collection.add({ positions: positions1, triangles: triangles1 }, polygon);
    collection.add({ positions: positions2, triangles: triangles2 }, polygon);
    collection.add({ positions: positions3, triangles: triangles3 }, polygon);

    Polygon3D.fromCollection(collection, 0, polygon);
    expect(polygon.getTriangleCount(), 2);
    expect(polygon.getTriangles(new Uint32Array(6))).toEqualEpsilon(
      triangles1,
      EPS,
    );

    Polygon3D.fromCollection(collection, 1, polygon);
    expect(polygon.getTriangleCount(), 1);
    expect(polygon.getTriangles(new Uint32Array(3))).toEqualEpsilon(
      triangles2,
      EPS,
    );

    Polygon3D.fromCollection(collection, 2, polygon);
    expect(polygon.getTriangleCount(), 1);
    expect(polygon.getTriangles(new Uint32Array(3))).toEqualEpsilon(
      triangles3,
      EPS,
    );
  });

  it("show", () => {
    const collection = new Polygon3DCollection();
    const polygon = new Polygon3D();

    collection.add({ show: true }, polygon);
    collection.add({ show: false }, polygon);

    expect(Polygon3D.fromCollection(collection, 0, polygon).show).toBe(true);
    expect(Polygon3D.fromCollection(collection, 1, polygon).show).toBe(false);
  });

  it("color", () => {
    const collection = new Polygon3DCollection();
    const polygon = new Polygon3D();

    collection.add({ color: Color.RED }, polygon);
    collection.add({ color: Color.GREEN }, polygon);
    collection.add({ color: Color.BLUE }, polygon);

    Polygon3D.fromCollection(collection, 0, polygon);
    expect(polygon.color).toEqualEpsilon(Color.RED, EPS);
    Polygon3D.fromCollection(collection, 1, polygon);
    expect(polygon.color).toEqualEpsilon(Color.GREEN, EPS);
    Polygon3D.fromCollection(collection, 2, polygon);
    expect(polygon.color).toEqualEpsilon(Color.BLUE, EPS);
  });
});
