// @ts-check

import defined from "../Core/defined.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Point3D from "./Point3D.js";
import Ellipsoid from "../Core/Ellipsoid.js";
import Matrix4 from "../Core/Matrix4.js";
import Buffer from "../Renderer/Buffer.js";
import BoundingSphere from "../Core/BoundingSphere.js";
import BufferUsage from "../Renderer/BufferUsage.js";
import VertexArray from "../Renderer/VertexArray.js";
import Transforms from "../Core/Transforms.js";
import ComponentDatatype from "../Core/ComponentDatatype.js";
import RenderState from "../Renderer/RenderState.js";
import BlendingState from "../Scene/BlendingState.js";
import Color from "../Core/Color.js";
import ShaderSource from "../Renderer/ShaderSource.js";
import ShaderProgram from "../Renderer/ShaderProgram.js";
import DrawCommand from "../Renderer/DrawCommand.js";
import Pass from "../Renderer/Pass.js";
import PrimitiveType from "../Core/PrimitiveType";

/** @import FrameState from "../Scene/FrameState.js" */
/** @import Point3DCollection from "./Point3DCollection.js" */

const Point3DAttributeLocations = {
  position: 0,
  color: 1,
};

/**
 * @typedef {object} Point3DRenderContext
 * @property {VertexArray} [vertexArray]
 * @property {RenderState} [renderState]
 * @property {ShaderProgram} [shaderProgram]
 * @property {object} [uniformMap]
 * @property {Matrix4} [transform]
 */

/**
 * @param {Point3DCollection} collection
 * @param {FrameState} frameState
 * @param {Point3DRenderContext} [renderContext]
 * @returns {Point3DRenderContext}
 */
function renderPoints(collection, frameState, renderContext) {
  const context = frameState.context;
  renderContext = renderContext || {};

  if (!defined(renderContext.transform)) {
    const globalMin = new Cartesian3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    const globalMax = new Cartesian3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );

    const point = new Point3D();
    const globalCartesian = new Cartesian3();

    for (let i = 0, il = collection.length; i < il; i++) {
      Point3D.fromCollection(collection, i, point).getPosition(globalCartesian);
      Cartesian3.minimumByComponent(globalMin, globalCartesian, globalMin);
      Cartesian3.maximumByComponent(globalMax, globalCartesian, globalMax);
    }

    // Compute the ENU matrix
    const ecefCenter = Cartesian3.midpoint(
      globalMin,
      globalMax,
      new Cartesian3(),
    );

    const toGlobal = Transforms.eastNorthUpToFixedFrame(
      ecefCenter,
      Ellipsoid.WGS84,
      new Matrix4(),
    );

    renderContext.transform = toGlobal;

    // TODO(donmccurdy): Renderer shouldn't be responsible for updating collection.
    BoundingSphere.fromCornerPoints(
      globalMin,
      globalMax,
      collection._boundingVolume,
    );
  }

  if (!defined(renderContext.vertexArray)) {
    const point = new Point3D();
    const globalCartesian = new Cartesian3();
    const localCartesian = new Cartesian3();

    const localMin = new Cartesian3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    const localMax = new Cartesian3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );

    const toLocal = Matrix4.inverseTransformation(
      renderContext.transform,
      new Matrix4(),
    );

    const positionTypedArray = new Float32Array(collection._positionCount * 3);
    const colorTypedArray = new Uint8Array(collection._positionCount * 4);

    for (let i = 0, il = collection._positionCount; i < il; i++) {
      Point3D.fromCollection(collection, i, point);

      // Position.
      point.getPosition(globalCartesian);
      Matrix4.multiplyByPoint(toLocal, globalCartesian, localCartesian);
      Cartesian3.minimumByComponent(localMin, localCartesian, localMin);
      Cartesian3.maximumByComponent(localMax, localCartesian, localMax);
      // @ts-expect-error TODO(donmccurdy): Incorrect types.
      Cartesian3.pack(localCartesian, positionTypedArray, i * 3);

      // Color.
      // @ts-expect-error TODO(donmccurdy): Incorrect types.
      Color.pack(point.color, colorTypedArray, i * 4);
    }

    const positionBuffer = Buffer.createVertexBuffer({
      typedArray: positionTypedArray,
      context,
      // @ts-expect-error TODO(donmccurdy): BufferUsage types incorrect.
      usage: BufferUsage.STATIC_DRAW,
    });

    const colorBuffer = Buffer.createVertexBuffer({
      typedArray: colorTypedArray,
      context,
      // @ts-expect-error TODO(donmccurdy): BufferUsage types incorrect.
      usage: BufferUsage.STATIC_DRAW,
    });

    renderContext.vertexArray = new VertexArray({
      context,
      attributes: [
        {
          index: Point3DAttributeLocations.position,
          vertexBuffer: positionBuffer,
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
        },
        {
          index: Point3DAttributeLocations.color,
          vertexBuffer: colorBuffer,
          componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
          componentsPerAttribute: 4,
        },
      ],
    });
  }

  if (!defined(renderContext.renderState)) {
    // @ts-expect-error TODO(donmccurdy): Will need to expose fromCache.
    renderContext.renderState = RenderState.fromCache({
      blending: BlendingState.DISABLED,
      depthMask: false,
      depthTest: { enabled: false }, // TODO(donmccurdy)
      polygonOffset: { enabled: false },
    });
  }

  if (!defined(renderContext.uniformMap)) {
    renderContext.uniformMap = {};
  }

  if (!defined(renderContext.shaderProgram)) {
    const vertexShaderSource = new ShaderSource({
      defines: [],
      sources: [
        `
in vec3 position;
in vec4 color;
void main()
{
  // TODO(donmccurdy): u_modelViewMatrix * position, possibly?
  vec4 positionEC = vec4(position, 1.0);
  gl_Position = czm_projection * positionEC;
}`.trim(),
      ],
    });

    const fragmentShaderSource = new ShaderSource({
      defines: [],
      sources: [
        `
void main()
{
  out_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  czm_writeLogDepth();
}`.trim(),
      ],
    });

    renderContext.shaderProgram = ShaderProgram.fromCache({
      context,
      vertexShaderSource,
      fragmentShaderSource,
      attributeLocations: Point3DAttributeLocations,
    });
  }

  const command = new DrawCommand({
    primitiveType: PrimitiveType.POINTS,
    pass: Pass.OPAQUE,

    vertexArray: renderContext.vertexArray,
    renderState: renderContext.renderState,
    shaderProgram: renderContext.shaderProgram,
    uniformMap: renderContext.uniformMap,

    owner: collection,
    boundingVolume: collection._boundingVolume,
    debugShowBoundingVolume: collection.debugShowBoundingVolume,

    // TODO(donmccurdy): pickId
  });

  frameState.commandList.push(command);

  return renderContext;
}

export default renderPoints;
