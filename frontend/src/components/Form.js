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
import { v4 as uuidv4 } from "uuid";

const Form = () => {
  // Temp for development
  let schema = checkLink_v2;

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
          <ReactMarkdown>{"## " + label}</ReactMarkdown>
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
      let required = false;
      let label = value.title || value.name || key;
      let helperText = value.description || "";
      let placeholder = "";
      let disabled = false;
      let enums = value.enum || [];
      console.log(enums);

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

      switch (value.type) {
        case "string":
        case "integer":
          field = textField(
            fieldId,
            label,
            value.type,
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
              <ReactMarkdown>{"## " + label}</ReactMarkdown>
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
                  Add Field
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
      }
    }

    const codeBlock = (
      <CopyBlock
       text={JSON.stringify(code, null, 2)}
        language={"javascript"}
         showLineNumbers={true}
         theme={nord}
         codeBlock />
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
