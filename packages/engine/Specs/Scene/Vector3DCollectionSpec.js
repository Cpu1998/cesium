import {
  Math as CesiumMath,
  Color,
  Vector3DCollection as TODO,
} from "../../index.js";
import Cartesian3 from "../../Source/Core/Cartesian3.js";

// TODO(donmccurdy): Split into separate files before merging.
const { Point3D, Point3DCollection } = TODO;

const EPS = CesiumMath.EPSILON8;

describe("Point3DCollection", () => {
  const position = new Cartesian3();

  it("Point3D#geometry", () => {
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
