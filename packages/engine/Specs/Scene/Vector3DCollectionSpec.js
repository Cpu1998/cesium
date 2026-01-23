import {
  Math as CesiumMath,
  Color,
  Vector3DCollection as TODO,
} from "../../index.js";
import Cartesian3 from "../../Source/Core/Cartesian3.js";

// TODO(donmccurdy): Split into separate files before merging.
const { Point3D, Point3DCollection, Polyline3D, Polyline3DCollection } = TODO;

const EPS = CesiumMath.EPSILON8;

describe("Point3DCollection", () => {
  const position = new Cartesian3();

  it("Point3D#batchId", () => {
    const collection = new Point3DCollection();
    const point = new Point3D();

    collection.add({}, point);
    collection.add({}, point);
    collection.add({}, point);

    expect(Point3D.fromCollection(collection, 0, point).batchId).toBe(0);
    expect(Point3D.fromCollection(collection, 1, point).batchId).toBe(1);
    expect(Point3D.fromCollection(collection, 2, point).batchId).toBe(2);
  });

  it("Point3D#position", () => {
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

  it("Point3D#show", () => {
    const collection = new Point3DCollection();
    const point = new Point3D();

    collection.add({ show: true }, point);
    collection.add({ show: false }, point);

    expect(Point3D.fromCollection(collection, 0, point).show).toBe(true);
    expect(Point3D.fromCollection(collection, 1, point).show).toBe(false);
  });

  it("Point3D#color", () => {
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
  it("Polyline3D#batchId", () => {
    const collection = new Polyline3DCollection();
    const polyline = new Polyline3D();

    collection.add({}, polyline);
    collection.add({}, polyline);
    collection.add({}, polyline);

    expect(Polyline3D.fromCollection(collection, 0, polyline).batchId).toBe(0);
    expect(Polyline3D.fromCollection(collection, 1, polyline).batchId).toBe(1);
    expect(Polyline3D.fromCollection(collection, 2, polyline).batchId).toBe(2);
  });

  it("Polyline3D#positions", () => {
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

  it("Polyline3D#show", () => {
    const collection = new Polyline3DCollection();
    const polyline = new Polyline3D();

    collection.add({ show: true }, polyline);
    collection.add({ show: false }, polyline);

    expect(Polyline3D.fromCollection(collection, 0, polyline).show).toBe(true);
    expect(Polyline3D.fromCollection(collection, 1, polyline).show).toBe(false);
  });

  it("Polyline3D#color", () => {
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
