import React, { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  Container,
  FormControlLabel,
  Checkbox,
  TextField,
  Button,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { CopyBlock, nord } from "react-code-blocks";
import checkLink_v2 from "doc-detective-common/src/schemas/output_schemas/checkLink_v2.schema.json";
import goTo_v2 from "doc-detective-common/src/schemas/output_schemas/goTo_v2.schema.json";
import find_v2 from "doc-detective-common/src/schemas/output_schemas/find_v2.schema.json";
import typeKeys_v2 from "doc-detective-common/src/schemas/output_schemas/typeKeys_v2.schema.json";
import runShell_v2 from "doc-detective-common/src/schemas/output_schemas/runShell_v2.schema.json";
import saveScreenshot_v2 from "doc-detective-common/src/schemas/output_schemas/saveScreenshot_v2.schema.json";
import setVariables_v2 from "doc-detective-common/src/schemas/output_schemas/setVariables_v2.schema.json";
import httpRequest_v2 from "doc-detective-common/src/schemas/output_schemas/httpRequest_v2.schema.json";
import wait_v2 from "doc-detective-common/src/schemas/output_schemas/wait_v2.schema.json";
// import { validate } from "doc-detective-common"
import { v4 as uuidv4 } from "uuid";

const Form = (schema) => {
  // Temp for development
  // console.log(schema)

  switch (schema.schema) {
    case "checkLink_v2":
      schema = checkLink_v2;
      break;
    case "wait_v2":
      schema = wait_v2;
      break;
    case "goTo_v2":
      schema = goTo_v2;
      break;
    case "find_v2":
      schema = find_v2;
      break;
    case "typeKeys_v2":
      schema = typeKeys_v2;
      break;
    case "runShell_v2":
      schema = runShell_v2;
      break;
    case "saveScreenshot_v2":
      schema = saveScreenshot_v2;
      break;
    case "setVariables_v2":
      schema = setVariables_v2;
      break;
    case "httpRequest_v2":
      schema = httpRequest_v2;
      break;
    default:
      console.log(`'${schema.schema}' isn't a valid schema name.`);
      break;
  }

  //  console.log(schema)

  const initValueState = (schema) => {
    const initValueState = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      let fieldId = `${schema.title}_${key}`;
      let defaultValue = "";
      if (value.const) {
        defaultValue = value.const;
      } else if (value.default) {
        defaultValue = value.default;
      } else if (
        schema.dynamicDefaults &&
        schema.dynamicDefaults[key] &&
        schema.dynamicDefaults[key] === "uuid"
      ) {
        defaultValue = uuidv4();
      }
      initValueState[fieldId] = defaultValue;
    }
    return initValueState;
  };

  const [valueState, setValueState] = useState(initValueState(schema));

  const generateFormFields = (schema) => {
    // Create a text field
    const textField = (
      fieldId,
      label = "",
      type = "string",
      required = false,
      disabled = false,
      helperText = "",
      placeholder = "",
      enums = [],
      value = valueState[fieldId],
      onChange = (event) =>
        setValueState({ ...valueState, [fieldId]: event.target.value })
    ) => {
      return (
        <div class="field">
          <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
          <ReactMarkdown>{helperText}</ReactMarkdown>
          <TextField
            fullWidth
            id={fieldId}
            // label={label}
            required={required}
            disabled={disabled}
            // helperText={helperText}
            placeholder={placeholder}
            {...(enums.length > 0 && { select: true })}
            {...(enums.length > 0 && { SelectProps: { native: true } })}
            {...(enums.length > 0 && { InputLabelProps: { shrink: true } })}
            value={value}
            onChange={onChange}
          >
            {enums.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </TextField>
        </div>
      );
    };

    const formFields = [];

    for (const [key, value] of Object.entries(schema.properties)) {
      let fieldId = `${schema.title}_${key}`;
      let field;
      let type = value.type || "";
      let required = false;
      let label = value.title || value.name || key;
      let helperText = value.description || "";
      let placeholder = "";
      let disabled = false;
      let enums = value.enum || [];

      // Get type
      // TODO: Add support for multiple types per field
      if (!type) {
        if (value.anyOf || value.oneOf) {
          let xOfArray = value.anyOf || value.oneOf;
          let typeOptions = xOfArray.filter((item) => item.type);
          if (typeOptions.includes((item) => item.type === "string")) {
            // Find if any types are "string"
            type = "string";
          } else if (typeOptions.length > 0) {
            // Set to first type
            type = typeOptions[0].type;
          }
        }
      }

      // Get disabled
      if (key === "action") {
        disabled = true;
      }

      // Get placeholder
      if (value.examples && value.examples.length > 0) {
        placeholder = value.examples[0];
      }

      // Check if field is required
      if (schema.required && schema.required.includes(key)) {
        required = true;
      }

      switch (type) {
        case "string":
        case "integer":
        case "number":
          field = textField(
            fieldId,
            label,
            type,
            required,
            disabled,
            helperText,
            placeholder,
            enums
          );
          break;
        // case "boolean":
        //   break;
        // case "object":
        //   break;
        case "array":
          // TODO: Add detection of supported data types in array
          // Get accepted type values from items.oneOf or items.anyOf
          // if (value.items.oneOf) {
          //   types = value.items.oneOf.map((item) => item.type);
          // } else if (value.items.anyOf) {
          //   types = value.items.anyOf.map((item) => item.type);
          // }

          // TODO: Add support for array of objects
          field = (
            <div>
              <ReactMarkdown>{`## ${label}${
                required ? "*" : ""
              }`}</ReactMarkdown>
              <ReactMarkdown>{helperText}</ReactMarkdown>
              <Container>
                {valueState[fieldId].map((value, index) => (
                  <div key={index}>
                    {textField(
                      fieldId + "_" + index,
                      "",
                      value.type,
                      "",
                      "",
                      "",
                      placeholder,
                      enums,
                      value,
                      (event) => {
                        const newValues = [...valueState[fieldId]];
                        newValues[index] = event.target.value;
                        setValueState({
                          ...valueState,
                          [fieldId]: newValues,
                        });
                      }
                    )}
                    <IconButton
                      aria-label="delete"
                      onClick={() => {
                        const newValues = [...valueState[fieldId]];
                        newValues.splice(index, 1);
                        setValueState({
                          ...valueState,
                          [fieldId]: newValues,
                        });
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </div>
                ))}
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    setValueState({
                      ...valueState,
                      [fieldId]: [...valueState[fieldId], ""],
                    });
                  }}
                >
                  Add a value
                </Button>
              </Container>
            </div>
          );
          break;
        default:
          // if (value.properties) {
          //   field = generateFormFields(value);
          // }
          break;
      }

      if (field) {
        formFields.push(field);
      }
    }

    return formFields;
  };

  const formFields = generateFormFields(schema);

  const generateCodeBlock = (schema) => {
    let code = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      let fieldId = `${schema.title}_${key}`;
      if (valueState[fieldId]) {
        code[key] = valueState[fieldId];
      } else if (schema.required && schema.required.includes(key)) {
        code[key] = "";
      }
    }

    const codeString = JSON.stringify(code, null, 2);
    const codeBlock = (
      <CopyBlock
        text={codeString}
        language={"javascript"}
        showLineNumbers={true}
        theme={nord}
        // onCopy={(event) => {
        //   // validate(schema, JSON.parse(code));
        //   console.log(event);
        // }}
        codeBlock
      />
    );
    return codeBlock;
  };

  const codeBlock = generateCodeBlock(schema);

  const handleSubmit = (event) => {
    event.preventDefault();
    console.log(event.target);
    const formData = new FormData(event.target);
    console.log(formData);
    // const formValues = Object.fromEntries(formData.entries());
    // console.log(formValues)
    // const json = JSON.stringify(formValues, null, 2);
    // console.log(json);
  };

  return (
    <form onSubmit={handleSubmit}>
      {() => {
        setValueState(initValueState);
      }}
      <h1>{schema.title}</h1>
      {formFields.map((field) => field)}
      {/* <Button type="submit" variant="contained" color="primary">
        Submit
      </Button> */}
      <br />
      <hr />
      <br />
      {codeBlock}
    </form>
  );
};

export default Form;
