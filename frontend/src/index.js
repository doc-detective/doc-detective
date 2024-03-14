import React, { useState } from "react";
import ReactDOM from "react-dom";
import "./index.css";
import SchemaForm from "./components/SchemaForm";
import { schemas } from "doc-detective-common/src/schemas";
import AppBar from "./components/AppBar";
import JSONBlock from "./components/JSONBlock";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

function App() {
  const [selectedSchema, setSelectedSchema] = useState("");
  const [formValue, setFormValue] = useState({});

  const handleSchemaChange = (event) => {
    setFormValue({});
    setSelectedSchema(event.target.value);
  };

  const handleFormChange = (value) => {
    setFormValue(() => {
      removeEmptyValues(value);
      return value;
    });
  };

  const removeEmptyValues = (obj) => {
    // console.log(`Removing empty values from ${JSON.stringify(obj)}`);
    Object.keys(obj).forEach((key) => {
      if (
        obj[key] &&
        !Array.isArray(obj) &&
        typeof obj[key] === "object" &&
        Object.keys(obj[key]).length > 0
      )
        removeEmptyValues(obj[key]);
      if (
        // Empty string, empty array, or empty object.
        obj[key] === "" ||
        (Array.isArray(obj[key]) && obj[key].length === 0) ||
        (typeof obj[key] === "object" && Object.keys(obj[key]).length === 0)
      )
        delete obj[key];
    });
    // console.log(`Removed empty values from ${JSON.stringify(obj)}`);
    return obj;
  };

  return (
    <div>
      <AppBar />
      <div class="body">
        <FormControl className="schemaSeledoc-detective/frontend/build/static doc-detective/frontend/build/static/css doc-detective/frontend/build/static/js doc-detective/frontend/build/asset-manifest.json doc-detective/frontend/build/index.htmlctor" style={{ minWidth: 300 }}>
          <InputLabel>Select an action</InputLabel>
          <Select value={selectedSchema} onChange={handleSchemaChange}>
            <MenuItem value="">Select an action</MenuItem>
            {Object.keys(schemas).map((key) => {
              if (
                schemas[key].title === "config" ||
                schemas[key].title === "context" ||
                schemas[key].title === "specification" ||
                schemas[key].title === "test" ||
                schemas[key].title === "moveTo"
              )
                return;
              return (
                <MenuItem key={key} value={key}>
                  {schemas[key].title}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        {/* {JSON.stringify(formValue)} */}
        {selectedSchema && (
          <SchemaForm
            key={selectedSchema}
            schema={schemas[selectedSchema]}
            passValueToParent={handleFormChange}
          />
        )}
      </div>
      {selectedSchema && (
        <div class="preview">
          <JSONBlock key={"preview"} object={formValue} />
        </div>
      )}
    </div>
  );
}

export default App;

ReactDOM.render(<App />, document.getElementById("root"));
