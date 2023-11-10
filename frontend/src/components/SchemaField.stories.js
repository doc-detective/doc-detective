import SchemaField from "./SchemaField";
import checkLink_v2 from "doc-detective-common/src/schemas/output_schemas/checkLink_v2.schema.json";
import goTo_v2 from "doc-detective-common/src/schemas/output_schemas/goTo_v2.schema.json";
import find_v2 from "doc-detective-common/src/schemas/output_schemas/find_v2.schema.json";
import typeKeys_v2 from "doc-detective-common/src/schemas/output_schemas/typeKeys_v2.schema.json";
import runShell_v2 from "doc-detective-common/src/schemas/output_schemas/runShell_v2.schema.json";
import saveScreenshot_v2 from "doc-detective-common/src/schemas/output_schemas/saveScreenshot_v2.schema.json";
import setVariables_v2 from "doc-detective-common/src/schemas/output_schemas/setVariables_v2.schema.json";
import httpRequest_v2 from "doc-detective-common/src/schemas/output_schemas/httpRequest_v2.schema.json";
import wait_v2 from "doc-detective-common/src/schemas/output_schemas/wait_v2.schema.json";
import context_v2 from "doc-detective-common/src/schemas/output_schemas/context_v2.schema.json";
import test_v2 from "doc-detective-common/src/schemas/output_schemas/test_v2.schema.json";
import spec_v2 from "doc-detective-common/src/schemas/output_schemas/spec_v2.schema.json";
import config_v2 from "doc-detective-common/src/schemas/output_schemas/config_v2.schema.json";

// This default export determines where your story goes in the story list.
export default {
  title: "Doc Detective/SchemaField",
  component: SchemaField,
  // args at the component level for all stories.
  args: {
    schema: find_v2,
    pathToKey: "",
    propertyKey: "id",
    propertyValue: find_v2.properties["id"],
  },
};

export const string = {
  args: {
    schema: find_v2,
    pathToKey: "",
    propertyKey: "description",
    propertyValue: find_v2.properties["description"],
  },
};
export const stringWithDynamicDefault = {
  args: {
    schema: find_v2,
    pathToKey: "",
    propertyKey: "id",
    propertyValue: find_v2.properties["id"],
  },
};
export const stringWithRequired = {
  args: {
    schema: find_v2,
    pathToKey: "",
    propertyKey: "selector",
    propertyValue: find_v2.properties["selector"],
  },
};
export const stringWithPattern = {
  args: {
    schema: checkLink_v2,
    pathToKey: "",
    propertyKey: "url",
    propertyValue: checkLink_v2.properties["url"],
  },
};
export const integerWithDefault = {
  args: {
    schema: find_v2,
    pathToKey: "",
    propertyKey: "timeout",
    propertyValue: find_v2.properties["timeout"],
  },
};
export const numberWithDefault = {
  args: {
    schema: wait_v2,
    pathToKey: "",
    propertyKey: "duration",
    propertyValue: wait_v2.properties["duration"],
  },
};
export const numberWithMinAndMax = {
  args: {
    schema: saveScreenshot_v2,
    pathToKey: "",
    propertyKey: "maxVariation",
    propertyValue: saveScreenshot_v2.properties["maxVariation"],
  },
};
export const enums = {
  args: {
    schema: saveScreenshot_v2,
    pathToKey: "",
    propertyKey: "overwrite",
    propertyValue: saveScreenshot_v2.properties["overwrite"],
  },
}
export const boolean = {
  args: {
    schema: find_v2,
    pathToKey: "",
    propertyKey: "click",
    propertyValue: find_v2.properties["click"],
  },
};
export const object = {
  args: {
    schema: context_v2,
    pathToKey: "",
    propertyKey: "app",
    propertyValue: context_v2.properties["app"],
  },
};
export const objectWithAdditionalProperties = {
  args: {
    schema: httpRequest_v2,
    pathToKey: "",
    propertyKey: "requestHeaders",
    propertyValue: httpRequest_v2.properties["requestHeaders"],
  },
};
export const arrayOfStrings = {
  args: {
    schema: runShell_v2,
    pathToKey: "",
    propertyKey: "args",
    propertyValue: runShell_v2.properties["args"],
  },
};
export const arrayOfIntegers = {
  args: {
    schema: checkLink_v2,
    pathToKey: "",
    propertyKey: "statusCodes",
    propertyValue: checkLink_v2.properties["statusCodes"],
  },
};
export const arrayOfObjects = {
  args: {
    schema: httpRequest_v2,
    pathToKey: "",
    propertyKey: "envsFromResponseData",
    propertyValue: httpRequest_v2.properties["envsFromResponseData"],
  },
};
