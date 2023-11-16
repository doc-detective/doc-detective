import React, { useState } from "react";
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
    setSelectedSchema(event.target.value);
  };

  const handleFormChange = (value) => {
    setFormValue(() => {
      removeEmptyValues(value);
      return value;
    });
  };

  const removeEmptyValues = (obj) => {
    console.log(`Removing empty values from ${JSON.stringify(obj)}`);
    Object.keys(obj).forEach((key) => {
      if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj) )
        removeEmptyValues(obj[key]);
      else if (obj[key] === "") delete obj[key];
    });
    return obj;
  };

  return (
    <div>
      <AppBar />
      <div class="body">
        <FormControl className="schemaSelector" style={{ minWidth: 300 }}>
          <InputLabel>Select a schema</InputLabel>
          <Select value={selectedSchema} onChange={handleSchemaChange}>
            <MenuItem value="">Select a schema</MenuItem>
            {Object.keys(schemas).map((key) => {
              return (
                <MenuItem key={key} value={key}>
                  {schemas[key].title}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        {JSON.stringify(formValue)}
        {selectedSchema && (
          <SchemaForm
            key={"form"}
            schema={schemas[selectedSchema]}
            passValueToParent={handleFormChange}
          />
        )}
      </div>
      <div class="preview">
        <JSONBlock key={"preview"} object={formValue} />
      </div>
    </div>
  );
}

export default App;

// ReactDOM.render(<App />, document.getElementById("root"));
