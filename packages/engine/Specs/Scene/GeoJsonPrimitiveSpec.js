import { RuntimeError } from "@cesium/core";
import {
  BufferPoint,
  BufferPolygon,
  BufferPolyline,
  GeoJsonPrimitive,
  HeightReference,
  SceneMode,
} from "../../index.js";

describe("Scene/GeoJsonPrimitive", function () {
  const lineGeoJson = {
    type: "LineString",
    coordinates: [
      [0.0, 0.0],
      [1.0, 1.0],
    ],
  };

  it("builds buffer primitive collections from mixed feature geometries", function () {
    const geoJson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "feature-0",
          properties: { name: "mixed" },
          geometry: {
            type: "GeometryCollection",
            geometries: [
              {
                type: "MultiPoint",
                coordinates: [
                  [0.0, 0.0],
                  [1.0, 1.0],
                ],
              },
              {
                type: "MultiLineString",
                coordinates: [
                  [
                    [0.0, 0.0],
                    [0.0, 1.0],
                  ],
                  [
                    [1.0, 1.0],
                    [2.0, 2.0],
                    [3.0, 3.0],
                  ],
                ],
              },
              {
                type: "Polygon",
                coordinates: [
                  [
                    [0.0, 0.0],
                    [2.0, 0.0],
                    [2.0, 2.0],
                    [0.0, 2.0],
                    [0.0, 0.0],
                  ],
                  [
                    [0.5, 0.5],
                    [1.5, 0.5],
                    [1.5, 1.5],
                    [0.5, 1.5],
                    [0.5, 0.5],
                  ],
                ],
              },
            ],
          },
        },
        {
          type: "Feature",
          id: 42,
          properties: { name: "multiPolygon" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [10.0, 0.0],
                  [12.0, 0.0],
                  [12.0, 2.0],
                  [10.0, 2.0],
                  [10.0, 0.0],
                ],
              ],
              [
                [
                  [20.0, 0.0],
                  [21.0, 0.0],
                  [21.0, 1.0],
                  [20.0, 1.0],
                  [20.0, 0.0],
                ],
              ],
            ],
          },
        },
      ],
    };

    const loader = GeoJsonPrimitive.fromGeoJson(geoJson);

    expect(loader.featureCount).toBe(2);
    expect(loader.ids).toEqual(["feature-0", 42]);
    expect(loader.getId(0)).toBe("feature-0");
    expect(loader.getId(1)).toBe(42);
    expect(loader.getProperties(0).name).toBe("mixed");
    expect(loader.getProperties(1).name).toBe("multiPolygon");

    expect(loader.points).toBeDefined();
    expect(loader.polylines).toBeDefined();
    expect(loader.polygons).toBeDefined();

    expect(loader.points.primitiveCount).toBe(2);
    expect(loader.polylines.primitiveCount).toBe(2);
    expect(loader.polygons.primitiveCount).toBe(3);
    expect(loader.polygons.holeCount).toBe(1);
    expect(loader.polygons.triangleCount).toBeGreaterThan(0);

    const point = new BufferPoint();
    loader.points.get(0, point);
    expect(point.featureId).toBe(0);
    loader.points.get(1, point);
    expect(point.featureId).toBe(0);

    const polyline = new BufferPolyline();
    loader.polylines.get(0, polyline);
    expect(polyline.featureId).toBe(0);
    loader.polylines.get(1, polyline);
    expect(polyline.featureId).toBe(0);

    const polygon = new BufferPolygon();
    loader.polygons.get(0, polygon);
    expect(polygon.featureId).toBe(0);
    loader.polygons.get(1, polygon);
    expect(polygon.featureId).toBe(1);
    loader.polygons.get(2, polygon);
    expect(polygon.featureId).toBe(1);
  });

  it("accepts top-level geometry objects", function () {
    const geoJson = {
      type: "MultiPoint",
      coordinates: [
        [100.0, 0.0],
        [101.0, 1.0],
      ],
    };

    const loader = GeoJsonPrimitive.fromGeoJson(geoJson);
    expect(loader.featureCount).toBe(1);
    expect(loader.ids.length).toBe(1);
    expect(loader.ids[0]).toBeUndefined();
    expect(loader.points.primitiveCount).toBe(2);
    expect(loader.polylines).toBeUndefined();
    expect(loader.polygons).toBeUndefined();
  });

  it("throws for unsupported top-level types", function () {
    const invalid = {
      type: "Topology",
      objects: {},
    };

    expect(function () {
      GeoJsonPrimitive.fromGeoJson(invalid);
    }).toThrowError(RuntimeError);
  });

  it("fromUrl rejects without a URL", async function () {
    await expectAsync(
      GeoJsonPrimitive.fromUrl(),
    ).toBeRejectedWithDeveloperError();
  });

  it("update initializes pick ids of a draped collection", function () {
    const markForFrame = jasmine.createSpy("markForFrame");
    const scene = { vectorProvider: { markForFrame } };

    const loader = GeoJsonPrimitive.fromGeoJson(lineGeoJson, {
      heightReference: HeightReference.CLAMP_TO_TERRAIN,
      scene: scene,
    });

    let pickIdKey = 0;
    const frameState = {
      mode: SceneMode.SCENE3D,
      passes: { render: true },
      frameNumber: 3,
      context: {
        createPickId(pickObject) {
          return { key: ++pickIdKey, pickObject };
        },
      },
    };

    loader.update(frameState);

    expect(markForFrame).toHaveBeenCalledWith(
      loader.polylines,
      3,
      HeightReference.CLAMP_TO_TERRAIN,
    );

    // A draped collection is rendered by the vector provider, not by itself.
    expect(loader.polylines._renderContext).toBeNull();

    // The vector provider packs the collection's pick ids into the surface's
    // pick pass; they must not stay at PickId.NULL_PICK_ID (0).
    expect(loader.polylines.get(0, new BufferPolyline())._pickId).not.toBe(0);
  });
});
