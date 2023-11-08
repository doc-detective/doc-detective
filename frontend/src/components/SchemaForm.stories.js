import SchemaForm from './SchemaForm';
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
  title: 'Doc Detective/SchemaForm',
  component: SchemaForm,
  // args at the component level for all stories.
  args: {
    schema:checkLink_v2
  },
  argTypes: {
    schema: { 
      options:[
        "checkLink",
        "goTo",
        "find",
        "typeKeys",
        "runShell",
        "saveScreenshot",
        "setVariables",
        "httpRequest",
        "wait",
        "context",
        "test",
        "spec",
        "config"
      ],
      mapping: {
        checkLink: checkLink_v2,
        goTo: goTo_v2,
        find: find_v2,
        typeKeys: typeKeys_v2,
        runShell: runShell_v2,
        saveScreenshot: saveScreenshot_v2,
        setVariables: setVariables_v2,
        httpRequest: httpRequest_v2,
        wait: wait_v2,
        context: context_v2,
        test: test_v2,
        spec: spec_v2,
        config: config_v2
      },
      }
  }
};

export const Default = {}