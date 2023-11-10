import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  TextField,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Switch,
  Button,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { v4 as uuidv4 } from "uuid";

const getType = (value) => {
  if (value.type) {
    return value.type;
  } else if (value.anyOf || value.oneOf) {
    let xOfArray = value.anyOf || value.oneOf;
    let typeOptions = xOfArray.filter((item) => item.type);
    if (typeOptions.includes((item) => item.type === "string")) {
      // Find if any types are "string"
      return "string";
    } else if (typeOptions.length > 0) {
      // Set to first type
      return typeOptions[0].type;
    }
  }
};

const SchemaField = ({
  schema,
  pathToKey,
  propertyKey,
  propertyValue,
  passValueToParent,
}) => {
  // Prop definitions.
  // schema: The schema that the field belongs to.
  // pathToKey: The path to the field in the schema.
  // propertyKey: The key of the field.
  // propertyValue: The property object that defines the field.
  // passValueToParent: A function that passes the value of the field to the parent component.

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
  let type = getType(propertyValue);

  // Get default value
  const defaultValue =
    propertyValue.default !== undefined
      ? propertyValue.default
      : schema.dynamicDefaults?.[propertyKey] === "uuid"
      ? uuidv4()
      : type === "array"
      ? []
      : type === "object"
      // Crawl object properties to get default values
      // TODO: Add support for nested objects
      ? Object.keys(propertyValue.properties).reduce((acc, key) => {
          acc[key] = propertyValue.properties[key].default;
          return acc;
        }
        , {})
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
    if (propertyValue.enum?.[0] !== "") propertyValue.enum?.unshift("");
    return (
      <div class="field" key={fieldPath}>
        {label && (
          <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        )}
        {helperText && <ReactMarkdown>{helperText}</ReactMarkdown>}
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
          onBlur={(e) => passValueToParent(e.target.value)}
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
                onChange={() => {
                  handleChange({ target: { value: !fieldValue } })
                  passValueToParent(!fieldValue)}
                }
              />
            }
          />
          {errorState && <FormHelperText>{errorMessage}</FormHelperText>}
        </FormControl>
      </div>
    );
  }

  // Handle objects
  if (type === "object") {
    const handleObjectChange = (key, value) => {
      const newFieldValue = { ...fieldValue };
      if (value === "") {
        delete newFieldValue[key];
      } else {
        newFieldValue[key] = value;
      }
      setFieldValue(newFieldValue);
      passValueToParent(newFieldValue);
    };
    return (
      <div key={fieldPath} style={{ marginLeft: 20 }}>
        <ReactMarkdown>{JSON.stringify(fieldValue,null,2)}</ReactMarkdown>
        <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        {helperText && <ReactMarkdown>{helperText}</ReactMarkdown>}
        {Object.keys(propertyValue.properties).map((key) => (
          <SchemaField
            {...{
              schema: propertyValue,
              pathToKey: fieldPath,
              propertyKey: key,
              propertyValue: propertyValue.properties[key],
              passValueToParent: (value) => handleObjectChange(key, value),
            }}
          />
        ))}
      </div>
    );
  }

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

  // Handle arrays
  if (type === "array") {
    const handleArrayDelete = (index) => {
      const newArray = [...fieldValue];
      newArray.splice(index, 1);
      setFieldValue(newArray);
    };

    const handleArrayChange = (index, value) => {
      const newArray = [...fieldValue];
      newArray[index] = value;
      setFieldValue(newArray);
    };

    // Flatten items.oneOf/anyOf arrays
    const getItems = (value) => {
      const items = [];
      if (value.items.anyOf)
        value.items.anyOf.forEach((item) => items.push(item));
      if (value.items.oneOf)
        value.items.oneOf.forEach((item) => items.push(item));
      return items;
    };
    const items = getItems(propertyValue);
    // TODO: Handle support for multiple types per field
    const itemValue = items[0];

    return (
      <div class="field" key={fieldPath}>
        <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        <ReactMarkdown>{helperText}</ReactMarkdown>
        {fieldValue &&
          fieldValue.map((item, index) => (
            <div
              key={`${fieldPath}[${index}]_${item}`}
              style={{ display: "flex" }}
            >
              <SchemaField
                {...{
                  schema: schema,
                  propertyValue: {
                    ...itemValue,
                    default: item,
                  },
                  passValueToParent: (value) => handleArrayChange(index, value),
                }}
              />
              <IconButton
                aria-label="delete"
                onClick={() => handleArrayDelete(index)}
              >
                <DeleteIcon />
              </IconButton>
            </div>
          ))}
        <Button
          variant="contained"
          color="primary"
          onClick={() => setFieldValue([...fieldValue, ""])}
        >
          Add
        </Button>
      </div>
    );
  }
};

// Default props.
SchemaField.defaultProps = {
  passValueToParent: () => {},
};

// Export the component.
export default SchemaField;
