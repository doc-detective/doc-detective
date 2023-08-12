import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import config_v2 from "doc-detective-common/src/schemas/output_schemas/config_v2.schema.json";
import spec_v2 from "doc-detective-common/src/schemas/output_schemas/spec_v2.schema.json";
import checkLink_v2 from "doc-detective-common/src/schemas/output_schemas/checkLink_v2.schema.json";
import validator from "@rjsf/validator-ajv8";
import ajv from "doc-detective-common"
import Form from "@rjsf/mui";
import FileUploader from "./FileUploader";
import TestButton from "./Button";
import AppBar from "./components/AppBar";

const uiSchema = {};

const log = (type) => console.log.bind(console, type);
ReactDOM.render(
  <div>
    <AppBar />
    <div class="body">
      {/* <TestButton /> */}
      {/* <FileUploader /> */}
      <Form
        schema={spec_v2}
        uiSchema={uiSchema}
        validator={ajv}
        onChange={log("changed")}
        onSubmit={log("submitted")}
        onError={log("errors")}
      />
    </div>
  </div>,
  document.getElementById("root")
);
