import Ajv from "ajv";
import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  TextField,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Switch,
  Button,
  IconButton,
  Paper,
  Menu,
  MenuItem,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import ArrowDownward from "@mui/icons-material/ArrowDownward";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
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

  // If the field is marked as const, pass the value to the parent component and return null.
  if (propertyValue.const) {
    useEffect(() => {
      passValueToParent(propertyValue.const);
    }, []);
    return null;
  }

  // Run custom logic.
  const fieldPath = propertyKey;
  const label = propertyValue.title || propertyValue.name || propertyKey;
  const helperText = propertyValue.description || "";
  const required = schema.required?.includes(propertyKey);
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
      ? // Crawl object properties to get default values
        // TODO: Add support for nested objects
        Object.keys(propertyValue.properties).reduce((acc, key) => {
          acc[key] = propertyValue.properties[key].default;
          return acc;
        }, {})
      : type === "boolean"
      ? false
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
  if (required && type !== "boolean") {
    validationRules.required = true;
  }

  // Set up state.
  const [fieldValue, setFieldValue] = useState(defaultValue);
  const [errorState, setErrorState] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const validateValue = (value) => {
    const inputValue = value;
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
  };

  useEffect(() => {
    validateValue(fieldValue);
  }, [fieldValue]);

  const handleChange = (value) => {
    validateValue(value);
    setFieldValue(value);
  };

  // Handle strings and numbers
  if (type === "string" || type === "number" || type === "integer") {
    useEffect(() => {
      passValueToParent(fieldValue);
    }, []);
    if (propertyValue.enum?.[0] !== "") propertyValue.enum?.unshift("");
    return (
      <div class="field" key={fieldPath}>
        {label && (
          <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        )}
        {/* {label && <ReactMarkdown>{JSON.stringify(fieldValue)}</ReactMarkdown>} */}
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
          onChange={(e) => handleChange(e.target.value)}
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
    useEffect(() => {
      passValueToParent(fieldValue);
    }, []);
    return (
      <div class="field" key={fieldPath}>
        {label && <ReactMarkdown>{`## ${label}`}</ReactMarkdown>}
        {/* {label && <ReactMarkdown>{JSON.stringify(fieldValue)}</ReactMarkdown>} */}
        {helperText && <ReactMarkdown>{helperText}</ReactMarkdown>}
        <FormControl component="fieldset" error={errorState}>
          <FormControlLabel
            control={
              <Switch
                checked={fieldValue}
                onChange={() => {
                  handleChange(!fieldValue);
                  passValueToParent(!fieldValue);
                }}
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
    const [pairs, setPairs] = useState([]);
    const handleAddPair = () => {
      // console.log("handleAddPair");
      setPairs([...pairs, { key: "", value: "" }]);
    };

    const handleDeletePair = (index) => {
      // console.log(`handleDeletePair: ${index}`);
      const newPairs = [...pairs];
      newPairs.splice(index, 1);
      setPairs(newPairs);
      // Update the parent component's state
      const pairsObject = newPairs.reduce((obj, pair) => {
        if (pair.key) obj[pair.key] = pair.value;
        return obj;
      }, {});
      const combinedObject = { ...pairsObject, ...fieldValue };
      // Sort object keys based on schema
      const sortedObject = {};
      Object.keys(propertyValue.properties).forEach((key) => {
        if (combinedObject[key]) sortedObject[key] = combinedObject[key];
      });
      passValueToParent(sortedObject);
    };

    const handlePairChange = (index, key, value) => {
      // console.log(`handlePairChange: ${index}, ${key}, ${value}`);
      const newPairs = pairs.map((pair, idx) => {
        if (idx === index) {
          return { key, value };
        }
        return pair;
      });
      setPairs(newPairs);
      // Update the parent component's state
      const pairsObject = newPairs.reduce((obj, pair) => {
        if (pair.key) obj[pair.key] = pair.value;
        return obj;
      }, {});
      const combinedObject = { ...pairsObject, ...fieldValue };
      // Sort object keys based on schema
      const sortedObject = {};
      Object.keys(propertyValue.properties).forEach((key) => {
        if (combinedObject[key]) sortedObject[key] = combinedObject[key];
      });
      // Add missing keys
      Object.keys(combinedObject).forEach((key) => {
        if (!sortedObject[key]) sortedObject[key] = combinedObject[key];
      });
      passValueToParent(sortedObject);
    };

    const handleObjectChange = (key, value) => {
      // console.log(`handleObjectChange: ${key}, ${JSON.stringify(value)}`);
      setFieldValue((oldFieldValue) => {
        const newFieldValue = { ...oldFieldValue };
        if (value === "") {
          delete newFieldValue[key];
        } else {
          newFieldValue[key] = value;
        }
        const pairsObject = pairs.reduce((obj, pair) => {
          if (pair.key) obj[pair.key] = pair.value;
          return obj;
        }, {});
        const combinedObject = { ...pairsObject, ...newFieldValue };
        // Sort object keys based on schema
        const sortedObject = {};
        Object.keys(propertyValue.properties).forEach((key) => {
          if (combinedObject[key]) sortedObject[key] = combinedObject[key];
        });
        passValueToParent(sortedObject);
        return newFieldValue;
      });
    };

    return (
      <div key={fieldPath}>
        {label && (
          <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        )}
        {/* {label && <ReactMarkdown>{JSON.stringify(fieldValue)}</ReactMarkdown>} */}
        {helperText && <ReactMarkdown>{helperText}</ReactMarkdown>}
        <div class="objectChildren">
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
          {propertyValue.additionalProperties && (
            <div>
              {pairs.map((pair, index) => (
                <div
                  key={index}
                  style={{ display: "flex", marginBottom: "10px" }}
                >
                  <TextField
                    label="Key"
                    value={pair.key}
                    onChange={(e) =>
                      handlePairChange(index, e.target.value, pair.value)
                    }
                    style={{ marginRight: "10px" }}
                  />
                  <TextField
                    label="Value"
                    value={pair.value}
                    onChange={(e) =>
                      handlePairChange(index, pair.key, e.target.value)
                    }
                  />
                  <IconButton
                    aria-label="delete"
                    onClick={() => handleDeletePair(index)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </div>
              ))}
              <Button
                variant="contained"
                color="primary"
                onClick={handleAddPair}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Handle arrays
  if (type === "array") {
    const handleArrayAdd = (schema) => {
      // console.log(`handleArrayAdd: ${JSON.stringify(schema)}`);
      const newItem = {
        _key: uuidv4(),
        value:
          schema.type === "object" ? {} : schema.type === "array" ? [] : "",
        schema,
      };
      const newArray = [...fieldValue, newItem];
      setFieldValue(newArray);
      const valueArray = newArray.map((item) => item.value);
      passValueToParent(valueArray);
    };

    const handleArrayDelete = (_key) => {
      // console.log(`handleArrayDelete: ${indexOr_key}`);
      const index = fieldValue.findIndex((item) => item._key === _key);
      const newArray = [...fieldValue];
      newArray.splice(index, 1);
      setFieldValue(newArray);
      const valueArray = newArray.map((item) => item.value);
      passValueToParent(valueArray);
    };

    const handleArrayChange = (_key, value) => {
      // console.log(`handleArrayChange: ${_key}, ${JSON.stringify(value)}}`);
      setFieldValue((oldFieldValue) => {
        const newArray = [...oldFieldValue];
        const index = fieldValue.findIndex((item) => item._key === _key);
        newArray[index] = { ...newArray[index], value };
        const valueArray = newArray.map((item) => item.value);
        passValueToParent(valueArray);
        return newArray;
      });
    };

    // Index manipulation
    const handleArrayMove = (index, direction) => {
      // console.log(`handleArrayMove: ${index}, ${direction}`);
      const newArray = [...fieldValue];
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= newArray.length) {
        return;
      }
      const temp = newArray[index];
      newArray[index] = newArray[newIndex];
      newArray[newIndex] = temp;
      setFieldValue(newArray);
      const valueArray = newArray.map((item) => item.value);
      passValueToParent(valueArray);
    };

    // Menu
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);
    const handleMenuClick = (event) => {
      setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
      setAnchorEl(null);
    };

    // Flatten items.oneOf/anyOf arrays
    const getItems = (value) => {
      const items = [];
      if (value.items && !value.items.anyOf && !value.items.oneOf)
        items.push(value.items);
      if (value.items.anyOf)
        value.items.anyOf.forEach((item) => items.push(item));
      if (value.items.oneOf)
        value.items.oneOf.forEach((item) => items.push(item));
      return items;
    };
    const items = getItems(propertyValue);

    // Iterate through fieldValue and assign schemas to each unassigned item based on its type
    const assignSchemas = (fieldValue, items) => {
      // console.log(`assignSchemas: ${JSON.stringify(fieldValue)}, ${JSON.stringify(items)}`);
      return fieldValue.map((value) => {
        // console.log(value)
        // If value has schema, it has already been assigned a schema
        if (value?.schema) return value;

        // Find schema with matching data type
        if (Array.isArray(value)) {
          // Find schema with type array
          const arraySchema = items.find((item) => item.type === "array");
          if (arraySchema)
            return { _key: uuidv4(), value: value, schema: arraySchema };
        } else if (typeof value === "object") {
          // Find all schemas with type object
          const objectSchemas = items.filter((item) => item.type === "object");
          const ajv = new Ajv({
            strictSchema: false,
            useDefaults: true,
            allErrors: true,
            coerceTypes: true,
          });
          // Find schema that matches object
          let objectSchema = {};
          for (const [key, value] of Object.entries(objectSchemas)) {
            ajv.addSchema(value, key);
            const check = ajv.getSchema(key);
            if (check(value)) {
              objectSchema = value;
              break;
            }
          }
          if (objectSchema)
            return { _key: uuidv4(), value: value, schema: objectSchema };
        } else if (typeof value === "number") {
          // Find schema with type number or integer
          const numberSchema = items.find(
            (item) => item.type === "number" || item.type === "integer"
          );
          if (numberSchema)
            return { _key: uuidv4(), value: value, schema: numberSchema };
        } else if (typeof value === "string") {
          // Find schema with type string
          const stringSchema = items.find((item) => item.type === "string");
          if (stringSchema)
            return { _key: uuidv4(), value: value, schema: stringSchema };
        } else if (typeof value === "boolean") {
          // Find schema with type boolean
          const booleanSchema = items.find((item) => item.type === "boolean");
          if (booleanSchema)
            return { _key: uuidv4(), value: value, schema: booleanSchema };
        } else {
          // If no schema found, return value
          return { _key: uuidv4(), value: value, schema: {} };
        }
      });
    };
    useEffect(() => {
      const assignedFieldValue = assignSchemas(fieldValue, items);
      setFieldValue(assignedFieldValue);
    }, []);

    return (
      <div class="field" key={fieldPath}>
        <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        {/* {label && <ReactMarkdown>{JSON.stringify(fieldValue)}</ReactMarkdown>} */}
        <ReactMarkdown>{helperText}</ReactMarkdown>
        <div class="arrayChildren">
          {fieldValue &&
            fieldValue.map((item, index) => (
              <Paper
                elevation={1}
                variant="outlined"
                key={item._key}
                style={{ display: "flex" }}
              >
                {/* {console.log(item)} */}
                <SchemaField
                  {...{
                    schema: propertyValue,
                    propertyValue: {
                      ...item.schema,
                      default: item.value,
                    },
                    passValueToParent: (value) =>
                      handleArrayChange(item._key, value),
                  }}
                />
                <IconButton
                  aria-label="up"
                  onClick={() => handleArrayMove(index, "up")}
                >
                  <ArrowUpward />
                </IconButton>
                <IconButton
                  aria-label="down"
                  onClick={() => handleArrayMove(index, "down")}
                >
                  <ArrowDownward />
                </IconButton>
                <IconButton
                  aria-label="delete"
                  onClick={() => handleArrayDelete(item._key)}
                >
                  <DeleteIcon />
                </IconButton>
              </Paper>
            ))}
          <div class="arrayAdd">
            {items.length === 1 && (
              <Button
                variant="contained"
                color="primary"
                onClick={() => handleArrayAdd(items[0])}
              >
                Add{" "}
                {items[0].title ||
                  label.replace(/s$/, "") ||
                  items[0].type ||
                  "Item"}
              </Button>
            )}
            {items.length > 1 && (
              <div>
                <Button
                  variant="contained"
                  aria-controls="simple-menu"
                  aria-haspopup="true"
                  color="primary"
                  onClick={handleMenuClick}
                  endIcon={<ArrowDropDownIcon />}
                >
                  Add
                </Button>
                <Menu
                  id="simple-menu"
                  anchorEl={anchorEl}
                  keepMounted
                  open={open}
                  onClose={handleMenuClose}
                >
                  {items &&
                    items.map((schema) => (
                      <MenuItem
                        onClick={() => {
                          handleArrayAdd(schema);
                          handleMenuClose();
                        }}
                      >
                        {schema.title ||
                          label.replace(/s$/, "") ||
                          schema.type ||
                          "Item"}
                      </MenuItem>
                    ))}
                </Menu>
              </div>
            )}
          </div>
        </div>
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
