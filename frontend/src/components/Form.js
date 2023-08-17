import React, { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  Container,
  FormControlLabel,
  Switch,
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
import context_v2 from "doc-detective-common/src/schemas/output_schemas/context_v2.schema.json";
import test_v2 from "doc-detective-common/src/schemas/output_schemas/test_v2.schema.json";
import spec_v2 from "doc-detective-common/src/schemas/output_schemas/spec_v2.schema.json";
import config_v2 from "doc-detective-common/src/schemas/output_schemas/config_v2.schema.json";

// import { validate } from "doc-detective-common"
import { v4 as uuidv4 } from "uuid";

const Form = (schema) => {
  // Temp for development
  // console.log(schema);

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
    case "context_v2":
      schema = context_v2;
      break;
    case "test_v2":
      schema = test_v2;
      break;
    case "spec_v2":
      schema = spec_v2;
      break;
    case "config_v2":
      schema = config_v2;
      break;
    default:
      console.log(`'${schema.schema}' isn't a valid schema name.`);
      break;
  }

  // console.log(schema);

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
  const [errorState, setErrorState] = useState({});

  const generateFormFields = (schema) => {

    // Error reporting
    const preValidate = (event, fieldId, validationRules) => {
      console.log("preValidate");
      console.log({value: event.target.value, fieldId, validationRules})
      validationRules.forEach((rule) => {
        switch (rule.type) {
          case "minLength":
            if (event.target.value.length < rule.value) {
              setErrorState({ ...errorState, [fieldId]: `Minimum length is ${rule.value}.` });
            }
            break;
          case "maxLength":
            if (event.target.value.length > rule.value) {
              setErrorState({ ...errorState, [fieldId]: `Max length is ${rule.value}.` });
            }
            break;
          case "min":
            if (event.target.value < rule.value) {
              setErrorState({ ...errorState, [fieldId]: `Minimum value is ${rule.value}.` });
            }
            break;
          case "max":
            if (event.target.value > rule.value) {
              setErrorState({ ...errorState, [fieldId]: `Max value is ${rule.value}.` });
            }
            break;
          case "pattern":
            if (!event.target.value.match(rule.value)) {
              setErrorState({ ...errorState, [fieldId]: `Must match the following regex pattern: ${rule.value}` });
            }
            break;
          // TODO: Enable format validation
          // case "format":
          //   if (!event.target.value.match(rule.value)) {
          //     setErrorState({ ...errorState, [fieldId]: rule.error || `Must be a valid ${rule.value}.` });
          //   }
          //   break;
          default:
            if (errorState[fieldId]) {
              let newErrorState = { ...errorState };
              delete newErrorState[fieldId];
              setErrorState(newErrorState);
              break;
            }
        }
      });
      console.log(errorState)
    };

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
      validationRules = [],
      value = valueState[fieldId],
      onChange = (event) =>
        setValueState({ ...valueState, [fieldId]: event.target.value }),
      onBlur = (event) => preValidate(event, fieldId, validationRules)
    ) => {
      return (
        <div class="field">
          <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
          <ReactMarkdown>{helperText}</ReactMarkdown>
          <TextField
            fullWidth
            id={fieldId}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            {...(enums.length > 0 && { select: true })}
            {...(enums.length > 0 && { SelectProps: { native: true } })}
            {...(enums.length > 0 && { InputLabelProps: { shrink: true } })}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
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

    const booleanField = (
      fieldId,
      label = "",
      required = false,
      disabled = false,
      helperText = "",
      value = valueState[fieldId],
      onChange = (event) =>
        setValueState({ ...valueState, [fieldId]: event.target.checked })
    ) => {
      return (
        <div>
          <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
          <ReactMarkdown>{helperText}</ReactMarkdown>
          <FormControlLabel
            required={required}
            disabled={disabled}
            control={<Switch checked={value} onChange={onChange} />}
          />
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
      let validationRules = [];

      // Skip if it has const value
      if (value.const) {
        continue;
      }

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

      // Get validation rules
      if (value.minLength) {
        validationRules.push({
          type: "minLength",
          value: value.minLength,
        });
      }
      if (value.maxLength) {
        validationRules.push({
          type: "maxLength",
          value: value.maxLength,
        });
      }
      if (value.minimum) {
        validationRules.push({
          type: "min",
          value: value.minimum,
        });
      }
      if (value.maximum) {
        validationRules.push({
          type: "max",
          value: value.maximum,
        });
      }
      if (value.pattern) {
        validationRules.push({
          type: "pattern",
          value: value.pattern,
        });
      }
      // TODO: Enable format validation
      // if (value.format) {
      //   let error;
      //   if (value.format === "uri"){
      //     error = "Must be a valid URI."
      //   }
      //   validationRules.push({
      //     type: "format",
      //     value: value.format,
      //     error: error
      //   });
      // }

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
            enums,
            validationRules
          );
          break;
        case "boolean":
          field = booleanField(fieldId, label, required, disabled, helperText);
          break;
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
                      validationRules,
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

  useEffect(() => {
    const errorBlock = generateErrorBlock(errorState);
    setErrorBlock(errorBlock);
  }, [errorState]);

  const generateErrorBlock = () => {
    console.log(errorState);
    const errorBlock = (
      <div>
        <ReactMarkdown>## Errors</ReactMarkdown>
        {Object.entries(errorState).map(([key, value]) => (
          <ReactMarkdown>{`- ${key}: ${value}`}</ReactMarkdown>
        ))}
      </div>
    );
    return errorBlock;
  };
  const [errorBlock, setErrorBlock] = useState(generateErrorBlock(errorState));

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
      {errorState.length > 0 && errorBlock}
      <br />
      {codeBlock}
    </form>
  );
};

export default Form;
