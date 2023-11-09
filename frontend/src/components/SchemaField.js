import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  TextField,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Switch,
} from "@mui/material";
import { v4 as uuidv4 } from "uuid";

const SchemaField = ({
  schema,
  pathToKey,
  propertyKey,
  propertyValue,
  setFieldData,
}) => {
  // Prop definitions.
  // schema: The schema that the field belongs to.
  // pathToKey: The path to the field in the schema.
  // propertyKey: The key of the field.
  // propertyValue: The property object that defines the field.
  // setFieldData: The function that updates the field data.

  // If the field is marked as const, it should not be editable.
  if (propertyValue.const) {
    return null;
  }

  // Run custom logic.
  const fieldPath = pathToKey ? `${pathToKey}.${propertyKey}` : propertyKey;
  const label = propertyValue.title || propertyValue.name || propertyKey;
  const helperText = propertyValue.description || "";
  const required = schema.required && schema.required.includes(propertyKey);
  const placeholder =
    propertyValue.examples && propertyValue.examples.length > 0
      ? propertyValue.examples[0]
      : null;

  // Get type
  // If type is not defined, check if anyOf or oneOf is defined
  // Prefer string types. If no string types, use first type.
  // TODO: Add support for multiple types per field
  let type = "";
  if (propertyValue.type) {
    type = propertyValue.type;
  } else {
    if (propertyValue.anyOf || propertyValue.oneOf) {
      let xOfArray = propertyValue.anyOf || propertyValue.oneOf;
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

  // Get default value
  const defaultValue =
    propertyValue.default !== undefined
      ? propertyValue.default
      : schema.dynamicDefaults?.[propertyKey] === "uuid"
      ? uuidv4()
      : type === "array"
      ? []
      : type === "object"
      ? {}
      : "";

  // Add validation rules
  let validationRules = {};
  if (propertyValue.minLength !== undefined) {
    validationRules.minLength = propertyValue.minLength;
  }
  if (propertyValue.maxLength !== undefined) {
    validationRules.maxLength = propertyValue.maxLength;
  }
  if (propertyValue.minimum !== undefined) {
    validationRules.minimum = propertyValue.minimum;
  }
  if (propertyValue.maximum !== undefined) {
    validationRules.maximum = propertyValue.maximum;
  }
  if (propertyValue.pattern !== undefined) {
    validationRules.pattern = propertyValue.pattern;
  }
  if (type === "number" || type === "integer") {
    validationRules.numeric = "^[0-9]*$";
  }
  if (required) {
    validationRules.required = true;
  }

  // Set up state.
  const [fieldValue, setFieldValue] = useState(defaultValue);
  const [errorState, setErrorState] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (event) => {
    const inputValue = event.target.value;
    let error = false;
    // You can add your validation logic here
    Object.keys(validationRules).forEach((rule) => {
      if (error) return;
      if (rule === "minimum" && inputValue < validationRules[rule]) {
        error = true;
        setErrorMessage(
          `Must be greater than or equal to ${validationRules[rule]}.`
        );
      } else if (rule === "maximum" && inputValue > validationRules[rule]) {
        error = true;
        setErrorMessage(
          `Must be less than or equal to ${validationRules[rule]}.`
        );
      } else if (
        rule === "minLength" &&
        inputValue.length < validationRules[rule]
      ) {
        error = true;
        setErrorMessage(
          `Must be at least ${validationRules[rule]} characters.`
        );
      } else if (
        rule === "maxLength" &&
        inputValue.length > validationRules[rule]
      ) {
        error = true;
        setErrorMessage(
          `Must be less than or equal to ${validationRules[rule]} characters.`
        );
      } else if (
        rule === "numeric" &&
        !new RegExp(validationRules[rule]).test(inputValue)
      ) {
        error = true;
        setErrorMessage(`Must be a number.`);
      } else if (
        rule === "pattern" &&
        !new RegExp(validationRules[rule]).test(inputValue)
      ) {
        error = true;
        setErrorMessage(
          `Must match the following pattern: ${validationRules[rule]}`
        );
      } else if (rule === "required" && !inputValue) {
        error = true;
        setErrorMessage(`Must have a value.`);
      }

      if (error) {
        setErrorState(true);
      } else {
        setErrorState(false);
        setErrorMessage("");
      }
    });
    setFieldValue(inputValue);
  };

  // Handle strings and numbers
  if (type === "string" || type === "number" || type === "integer") {
    return (
      <div class="field" key={fieldPath}>
        <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        <ReactMarkdown>{helperText}</ReactMarkdown>
        <TextField
          key={fieldPath}
          required={required}
          value={fieldValue}
          placeholder={placeholder}
          error={errorState}
          helperText={errorState ? errorMessage : ""}
          {...(propertyValue.enum?.length > 0 && { select: true })}
          {...(propertyValue.enum?.length > 0 && {
            SelectProps: { native: true },
          })}
          {...(propertyValue.enum?.length > 0 && {
            InputLabelProps: { shrink: true },
          })}
          onChange={handleChange}
          margin="normal"
          fullWidth
        >
          {propertyValue.enum?.map((option) => (
            <option
              key={option}
              value={option}
              {...(option === defaultValue && { selected: true })}
            >
              {option}
            </option>
          ))}
        </TextField>
      </div>
    );
  }

  // Handle booleans
  if (type === "boolean") {
    return (
      <div class="field" key={fieldPath}>
        <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        <ReactMarkdown>{helperText}</ReactMarkdown>
        <FormControl component="fieldset" error={errorState}>
          <FormControlLabel
            required={required}
            control={
              <Switch
                checked={fieldValue}
                onChange={() =>
                  handleChange({ target: { value: !fieldValue } })
                }
              />
            }
          />
          {errorState && <FormHelperText>{errorMessage}</FormHelperText>}
        </FormControl>
      </div>
    );
  }

  // TODO: Handle objects
  // TODO: Handle objects with additionalProperties
  // TODO: Handle nested objects
  // if (value.type === "object") {
  //     return (
  //       <div key={fieldPath} style={{ marginLeft: 20 }}>
  //         <Typography variant="h6">{value.title || key}</Typography>
  //         {generateFields(value, formData[key] || {}, setFormData, fieldPath)}
  //       </div>
  //     );
  //   }

  // TODO: Handle arrays
  // TODO: Handle different field types within arrays
  // if (value.type === "array") {
  //     // This is a simplified version for arrays of strings or numbers.
  //     // Complex array items would need more sophisticated handling.
  //     return (
  //       <div key={fieldPath}>
  //         <InputLabel>{value.title || key}</InputLabel>
  //         {formData[key] &&
  //           formData[key].map((item, index) => (
  //             <TextField
  //               key={`${fieldPath}[${index}]`}
  //               label={`${value.items.title || key} ${index + 1}`}
  //               value={item}
  //               onChange={(e) => {
  //                 const newArray = [...formData[key]];
  //                 newArray[index] = e.target.value;
  //                 setFormData({ ...formData, [fieldPath]: newArray });
  //               }}
  //               margin="normal"
  //               fullWidth
  //             />
  //           ))}
  //         <Button
  //           onClick={() =>
  //             setFormData({
  //               ...formData,
  //               [fieldPath]: [...(formData[key] || []), ""],
  //             })
  //           }
  //         >
  //           Add {value.items.title || key}
  //         </Button>
  //       </div>
  //     );
  //   }
};

// Export the component.
export default SchemaField;
