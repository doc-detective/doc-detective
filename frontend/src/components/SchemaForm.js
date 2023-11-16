import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import SchemaField from "./SchemaField";

const SchemaForm = ({ schema, passValueToParent }) => {
  // Prop definitions.
  // schema: The schema that the field belongs to.
  // passValueToParent: A function that passes the value of the field to the parent component.

  // Set up state and handling.
  const [formValue, setFormValue] = useState({});
  const handleFormUpdate = (key, value) => {
    // Update the form value.
    const newValue = { ...formValue, [key]: value };
    setFormValue(newValue);
    // Pass the value to the parent component.
    passValueToParent(newValue);
  };
  // Run custom logic.
  // const text = isMultiline ? JSON.stringify(object, null, 2) : JSON.stringify(object);

  // Return the component.
  return (
    <div className="schema-form">
      {/* <ReactMarkdown>{JSON.stringify(formValue)}</ReactMarkdown> */}
      {schema.title && <ReactMarkdown>{`## ${schema.title}`}</ReactMarkdown>}
      {schema.description && <ReactMarkdown>{schema.description}</ReactMarkdown>}

      {Object.entries(schema.properties).map(([key, value]) => {
        return (
          <SchemaField
            key={schema.title + key}
            schema={schema}
            propertyKey={key}
            propertyValue={value}
            passValueToParent={(value) => handleFormUpdate(key, value)}
          />
        );
      })}
    </div>
  );
};

// Default props.
SchemaForm.defaultProps = {
  passValueToParent: () => {},
};

// Export the component.
export default SchemaForm;
