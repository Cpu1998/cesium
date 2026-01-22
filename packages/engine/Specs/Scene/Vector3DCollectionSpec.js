import {
  Math as CesiumMath,
  Color,
  Vector3DCollection as TODO,
} from "../../index.js";
import Cartesian3 from "../../Source/Core/Cartesian3.js";

// TODO(donmccurdy): Split into separate files when further along.
const { Point3DCollection } = TODO;

describe("Point3DCollection", () => {
  const position = new Cartesian3();

  it("Point3D#geometry", () => {
    const collection = new Point3DCollection();

    let point = collection.add();
    point.setPosition(Cartesian3.UNIT_X);
    collection.release(point);

    point = collection.add();
    point.setPosition(Cartesian3.UNIT_Y);
    collection.release(point);

    point = collection.add();
    point.setPosition(Cartesian3.UNIT_Z);
    collection.release(point);

    point = collection.get(0);
    point.getPosition(position);
    expect(position).toEqualEpsilon(Cartesian3.UNIT_X, CesiumMath.EPSILON8);
    collection.release(point);

    point = collection.get(1);
    point.getPosition(position);
    expect(position).toEqualEpsilon(Cartesian3.UNIT_Y, CesiumMath.EPSILON8);
    collection.release(point);

    point = collection.get(2);
    point.getPosition(position);
    expect(position).toEqualEpsilon(Cartesian3.UNIT_Z, CesiumMath.EPSILON8);
    collection.release(point);
  });

  it("Point3D#show", () => {
    const collection = new Point3DCollection();

    let point = collection.add();
    point.show = true;
    collection.release(point);

    point = collection.add();
    point.show = false;
    collection.release(point);

    point = collection.get(0);
    expect(point.show).toBe(true);
    collection.release(point);

    point = collection.get(1);
    expect(point.show).toBe(false);
    collection.release(point);
  });

  it("Point3D#color", () => {
    const collection = new Point3DCollection();

    let point = collection.add();
    point.color = Color.RED;
    collection.release(point);

    point = collection.add();
    point.color = Color.GREEN;
    collection.release(point);

    point = collection.add();
    point.color = Color.BLUE;
    collection.release(point);

    point = collection.get(0);
    expect(point.color).toEqualEpsilon(Color.RED, CesiumMath.EPSILON8);
    collection.release(point);

    point = collection.get(1);
    expect(point.color).toEqualEpsilon(Color.GREEN, CesiumMath.EPSILON8);
    collection.release(point);

    point = collection.get(2);
    expect(point.color).toEqualEpsilon(Color.BLUE, CesiumMath.EPSILON8);
    collection.release(point);
  });
});
