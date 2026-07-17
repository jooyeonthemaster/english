/*
 * Deliberately small, dependency-free JSON Schema 2020-12 evaluator.
 *
 * This is not advertised as a general JSON Schema implementation.  It is an
 * exhaustive implementation of every assertion/applicator keyword used by the
 * two schemas sealed in this package. `assertSchemaSupported` walks every
 * schema node and fails closed if a future edit introduces an unsupported
 * keyword, which prevents the old failure mode where a verifier silently
 * checked only a hand-written subset of fields.
 */

const SUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "minProperties",
  "maxProperties",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
]);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const SCHEMA_TYPES = new Set([
  "null",
  "array",
  "object",
  "integer",
  "number",
  "string",
  "boolean",
]);

function schemaChildren(schema) {
  const children = [];
  for (const key of ["items", "additionalProperties", "not", "if", "then", "else"]) {
    if (isObject(schema[key]) || typeof schema[key] === "boolean") {
      children.push([key, schema[key]]);
    }
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(schema[key])) {
      schema[key].forEach((child, index) => children.push([`${key}/${index}`, child]));
    }
  }
  for (const key of ["properties", "$defs"]) {
    if (isObject(schema[key])) {
      for (const [name, child] of Object.entries(schema[key])) {
        children.push([`${key}/${name}`, child]);
      }
    }
  }
  return children;
}

export function assertSchemaSupported(schema, path = "#") {
  if (typeof schema === "boolean") return;
  if (!isObject(schema)) throw new Error(`Schema node ${path} is not an object/boolean`);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new Error(`Unsupported JSON Schema keyword ${key} at ${path}`);
    }
  }
  if (hasOwn(schema, "$ref") && typeof schema.$ref !== "string") {
    throw new Error(`Malformed $ref at ${path}`);
  }
  if (hasOwn(schema, "type") && (typeof schema.type !== "string" || !SCHEMA_TYPES.has(schema.type))) {
    throw new Error(`Malformed type at ${path}`);
  }
  if (hasOwn(schema, "enum") && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    throw new Error(`Malformed enum at ${path}`);
  }
  if (
    hasOwn(schema, "required") &&
    (!Array.isArray(schema.required) ||
      schema.required.some((key) => typeof key !== "string") ||
      new Set(schema.required).size !== schema.required.length)
  ) {
    throw new Error(`Malformed required at ${path}`);
  }
  for (const key of ["properties", "$defs"]) {
    if (hasOwn(schema, key) && !isObject(schema[key])) throw new Error(`Malformed ${key} at ${path}`);
  }
  if (
    hasOwn(schema, "additionalProperties") &&
    typeof schema.additionalProperties !== "boolean" &&
    !isObject(schema.additionalProperties)
  ) {
    throw new Error(`Malformed additionalProperties at ${path}`);
  }
  for (const key of ["items", "not", "if", "then", "else"]) {
    if (hasOwn(schema, key) && typeof schema[key] !== "boolean" && !isObject(schema[key])) {
      throw new Error(`Malformed ${key} at ${path}`);
    }
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (hasOwn(schema, key) && (!Array.isArray(schema[key]) || schema[key].length === 0)) {
      throw new Error(`Malformed ${key} at ${path}`);
    }
  }
  for (const key of ["minItems", "maxItems", "minLength", "maxLength", "minProperties", "maxProperties"]) {
    if (hasOwn(schema, key) && (!Number.isInteger(schema[key]) || schema[key] < 0)) {
      throw new Error(`Malformed ${key} at ${path}`);
    }
  }
  for (const key of ["minimum", "maximum"]) {
    if (hasOwn(schema, key) && (typeof schema[key] !== "number" || !Number.isFinite(schema[key]))) {
      throw new Error(`Malformed ${key} at ${path}`);
    }
  }
  if (hasOwn(schema, "uniqueItems") && typeof schema.uniqueItems !== "boolean") {
    throw new Error(`Malformed uniqueItems at ${path}`);
  }
  if (hasOwn(schema, "pattern")) {
    if (typeof schema.pattern !== "string") throw new Error(`Malformed pattern at ${path}`);
    try {
      new RegExp(schema.pattern, "u");
    } catch {
      throw new Error(`Invalid pattern at ${path}`);
    }
  }
  for (const [minimumKey, maximumKey] of [
    ["minItems", "maxItems"],
    ["minLength", "maxLength"],
    ["minProperties", "maxProperties"],
    ["minimum", "maximum"],
  ]) {
    if (hasOwn(schema, minimumKey) && hasOwn(schema, maximumKey) && schema[minimumKey] > schema[maximumKey]) {
      throw new Error(`Inverted ${minimumKey}/${maximumKey} at ${path}`);
    }
  }
  for (const [childPath, child] of schemaChildren(schema)) {
    assertSchemaSupported(child, `${path}/${childPath}`);
  }
}

function pointerDecode(value) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`Only local JSON pointers are supported: ${ref}`);
  let current = root;
  for (const part of ref.slice(2).split("/").map(pointerDecode)) {
    if (!isObject(current) || !hasOwn(current, part)) {
      throw new Error(`Unresolvable JSON Schema reference ${ref}`);
    }
    current = current[part];
  }
  return current;
}

function jsonEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]))
    );
  }
  return false;
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function escapePathPart(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function evaluate(schema, value, root, instancePath, schemaPath) {
  if (schema === true) return [];
  if (schema === false) return [{ keyword: "falseSchema", instancePath, schemaPath }];

  const errors = [];
  const fail = (keyword, detail = undefined) =>
    errors.push({ keyword, instancePath, schemaPath: `${schemaPath}/${keyword}`, detail });

  if (schema.$ref) {
    errors.push(
      ...evaluate(resolveRef(root, schema.$ref), value, root, instancePath, `${schemaPath}/$ref`),
    );
  }

  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    fail("type", { expected: schema.type });
    return errors;
  }
  if (schema.const !== undefined && !jsonEqual(value, schema.const)) fail("const");
  if (schema.enum !== undefined && !schema.enum.some((candidate) => jsonEqual(candidate, value))) {
    fail("enum");
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) fail("minLength");
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) fail("maxLength");
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) fail("pattern");
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) fail("minimum");
    if (schema.maximum !== undefined && value > schema.maximum) fail("maximum");
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail("minItems");
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail("maxItems");
    if (schema.uniqueItems) {
      for (let index = 0; index < value.length; index += 1) {
        if (value.slice(0, index).some((prior) => jsonEqual(prior, value[index]))) {
          fail("uniqueItems", { duplicateIndex: index });
          break;
        }
      }
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        errors.push(
          ...evaluate(
            schema.items,
            item,
            root,
            `${instancePath}/${index}`,
            `${schemaPath}/items`,
          ),
        );
      });
    }
  }

  if (isObject(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) fail("minProperties");
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) fail("maxProperties");
    for (const required of schema.required ?? []) {
      if (!hasOwn(value, required)) fail("required", { missingProperty: required });
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(properties)) {
      if (hasOwn(value, key)) {
        errors.push(
          ...evaluate(
            child,
            value[key],
            root,
            `${instancePath}/${escapePathPart(key)}`,
            `${schemaPath}/properties/${escapePathPart(key)}`,
          ),
        );
      }
    }
    const extras = keys.filter((key) => !hasOwn(properties, key));
    if (schema.additionalProperties === false && extras.length > 0) {
      extras.forEach((key) => fail("additionalProperties", { additionalProperty: key }));
    } else if (isObject(schema.additionalProperties) || typeof schema.additionalProperties === "boolean") {
      for (const key of extras) {
        errors.push(
          ...evaluate(
            schema.additionalProperties,
            value[key],
            root,
            `${instancePath}/${escapePathPart(key)}`,
            `${schemaPath}/additionalProperties`,
          ),
        );
      }
    }
  }

  for (const [keyword, expectedMatches] of [
    ["allOf", schema.allOf?.length],
    ["anyOf", 1],
    ["oneOf", 1],
  ]) {
    if (!schema[keyword]) continue;
    const results = schema[keyword].map((branch, index) => ({
      index,
      errors: evaluate(branch, value, root, instancePath, `${schemaPath}/${keyword}/${index}`),
    }));
    const matches = results.filter((result) => result.errors.length === 0).length;
    const valid = keyword === "allOf" ? matches === expectedMatches : keyword === "anyOf" ? matches >= 1 : matches === 1;
    if (!valid) fail(keyword, { matches, branches: results.length });
  }

  if (schema.not !== undefined) {
    if (evaluate(schema.not, value, root, instancePath, `${schemaPath}/not`).length === 0) fail("not");
  }
  if (schema.if !== undefined) {
    const conditionPasses = evaluate(schema.if, value, root, instancePath, `${schemaPath}/if`).length === 0;
    const selected = conditionPasses ? schema.then : schema.else;
    if (selected !== undefined) {
      errors.push(
        ...evaluate(
          selected,
          value,
          root,
          instancePath,
          `${schemaPath}/${conditionPasses ? "then" : "else"}`,
        ),
      );
    }
  }
  return errors;
}

export function validateJsonSchema(schema, value) {
  assertSchemaSupported(schema);
  return evaluate(schema, value, schema, "", "#");
}

export function usedSchemaKeywords(schema) {
  const found = new Set();
  function walk(node) {
    if (typeof node === "boolean") return;
    Object.keys(node).forEach((key) => found.add(key));
    schemaChildren(node).forEach(([, child]) => walk(child));
  }
  walk(schema);
  return [...found].sort();
}
