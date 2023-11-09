import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { TextField } from "@mui/material";
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
  const defaultValue = propertyValue.default
    ? propertyValue.default
    : schema.dynamicDefaults?.[propertyKey] === "uuid"
    ? uuidv4()
    : "";

  // Get type
  // TODO: Add support for multiple types per field
  if (propertyValue.type) {
    let type = propertyValue.type;
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

  // TODO: Add validation rules
  // TODO: Evaluate type

  // Set up state.
  const [fieldValue, setFieldValue] = useState(defaultValue);

  // Handle strings
  if (
    (type === "string" && !propertyValue.enum) ||
    type === "number" ||
    type === "integer"
  ) {
    return (
      <div class="field" key={fieldPath}>
        <ReactMarkdown>{`## ${label}${required ? "*" : ""}`}</ReactMarkdown>
        <ReactMarkdown>{helperText}</ReactMarkdown>
        <TextField
          key={fieldPath}
          required={required}
          value={fieldValue}
          onChange={(e) => setFieldValue(e.target.value)}
          margin="normal"
          fullWidth
        />
      </div>
    );
  }

  // TODO: Handle enums (dropdowns)
  // if (propertyValue.enum) {
  //   return (
  //     <FormControl key={fieldPath} fullWidth margin="normal">
  //       <InputLabel>{propertyValue.title || key}</InputLabel>
  //       <Select
  //         value={fieldValue}
  //         onChange={(e) =>
  //           setFormData({ ...formData, [fieldPath]: e.target.value })
  //         }
  //         label={propertyValue.title || key}
  //       >
  //         {value.enum.map((option) => (
  //           <MenuItem key={option} value={option}>
  //             {option}
  //           </MenuItem>
  //         ))}
  //       </Select>
  //     </FormControl>
  //   );
  // }

  // TODO: Handle numbers

  // TODO: Handle booleans

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
