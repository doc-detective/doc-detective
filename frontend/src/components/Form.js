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
      onChange = (event) =>
        setValueState({ ...valueState, [fieldId]: event.target.value })
    ) => {
      return (
        <TextField
          id={fieldId}
          label={label}
          {...(type === "integer" && { type: "number" })}
          required={required}
          disabled={disabled}
          helperText={helperText}
          placeholder={placeholder}
          {...(enums.length > 0 && { select: true })}
          {...(enums.length > 0 && { SelectProps: { native: true } })}
          {...(enums.length > 0 && { InputLabelProps: { shrink: true } })}
          value={valueState[fieldId]}
          onChange={onChange}
        >
          {enums.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </TextField>
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
        case "string" || "integer":
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
          // TODO: Add support for array of objects
          field = (
            <div>
              {" "}
              <ReactMarkdown>{label}</ReactMarkdown>
              <ReactMarkdown>{helperText}</ReactMarkdown>
              <Container>
                {valueState[fieldId].map((value, index) => (
                  <div key={index}>
                    <TextField
                      value={value}
                      onChange={(event) => {
                        const newValues = [...valueState[fieldId]];
                        newValues[index] = event.target.value;
                        setValueState({
                          ...valueState,
                          [fieldId]: newValues,
                        });
                      }}
                    />
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
        case "integer":
          field = (
            <Select label={key}>
              {value.enum.map((option) => (
                <MenuItem value={option}>{option}</MenuItem>
              ))}
            </Select>
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // const [fields, setFields] = useState([{ value: null }]);

  const handleSubmit = (event) => {
    event.preventDefault();
    console.log(`Name: ${name}\nEmail: ${email}\nMessage: ${message}`);
  };

  const handleAddField = (value) => {
    const values = [...fields];
    values.push({ value: value });
    setFields(values);
  };

  const handleFieldChange = (id, value) => {
    setValueState({ ...valueState, id: value });
  };

  // const handleFieldChange = (index, event) => {
  //   const values = [...fields];
  //   values[index].value = event.target.value;
  //   setFields(values);
  // };

  // const formFields = generateFormFields(checkLink_v2);

  return (
    <form onSubmit={handleSubmit}>
      {() => {
        setValueState(initValueState);
      }}
      {/* <TextField
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                margin="normal"
                required
            />
            <TextField
                label="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                margin="normal"
                required
            />
            <TextField
                label="Message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                margin="normal"
                multiline
                rows={4}
                required
            /> */}
      {formFields.map((field) => field)}
      {/* {fields.map((field, index) => (
                <TextField
                    key={index}
                    label={`Field ${index + 1}`}
                    value={field.value}
                    onChange={(event) => handleFieldChange(index, event)}
                    margin="normal"
                    required
                />
            ))} */}
      <Button type="submit" variant="contained" color="primary">
        Submit
      </Button>
      <Button onClick={handleAddField} variant="contained" color="secondary">
        +
      </Button>
    </form>
  );
};

export default Form;
