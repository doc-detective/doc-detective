import React, { useState, useEffect } from 'react';
import { TextField, Select, MenuItem, FormControl, InputLabel, Button, Checkbox, FormControlLabel, Typography } from '@mui/material';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, useDefaults: true });

const generateFields = (schema, formData, setFormData, path = '') => {
  // The path is used to handle nested properties
  return Object.entries(schema.properties).map(([key, value]) => {
    const fieldPath = path ? `${path}.${key}` : key;
    
    // Handle strings
    if (value.type === 'string' && !value.enum) {
      return (
        <TextField
          key={fieldPath}
          label={value.title || key}
          value={formData[key] || ''}
          onChange={(e) => setFormData({ ...formData, [fieldPath]: e.target.value })}
          margin="normal"
          fullWidth
        />
      );
    }
    
    // Handle enums (dropdowns)
    if (value.enum) {
      return (
        <FormControl key={fieldPath} fullWidth margin="normal">
          <InputLabel>{value.title || key}</InputLabel>
          <Select
            value={formData[key] || ''}
            onChange={(e) => setFormData({ ...formData, [fieldPath]: e.target.value })}
            label={value.title || key}
          >
            {value.enum.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }
    
    // Handle nested objects
    if (value.type === 'object') {
      return (
        <div key={fieldPath} style={{ marginLeft: 20 }}>
          <Typography variant="h6">{value.title || key}</Typography>
          {generateFields(value, formData[key] || {}, setFormData, fieldPath)}
        </div>
      );
    }
    
    // Handle arrays
    if (value.type === 'array') {
      // This is a simplified version for arrays of strings or numbers.
      // Complex array items would need more sophisticated handling.
      return (
        <div key={fieldPath}>
          <InputLabel>{value.title || key}</InputLabel>
          {formData[key] && formData[key].map((item, index) => (
            <TextField
              key={`${fieldPath}[${index}]`}
              label={`${value.items.title || key} ${index + 1}`}
              value={item}
              onChange={(e) => {
                const newArray = [...formData[key]];
                newArray[index] = e.target.value;
                setFormData({ ...formData, [fieldPath]: newArray });
              }}
              margin="normal"
              fullWidth
            />
          ))}
          <Button onClick={() => setFormData({ ...formData, [fieldPath]: [...(formData[key] || []), ''] })}>
            Add {value.items.title || key}
          </Button>
        </div>
      );
    }
    
    // Add cases for other types as needed
  });
};

const SchemaForm = ({ schema }) => {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  
  const validateFormData = (data) => {
    const valid = ajv.validate(schema, data);
    setErrors(valid ? {} : ajv.errors);
    return valid;
  };

  useEffect(() => {
    validateFormData(formData);
  }, [formData]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (validateFormData(formData)) {
      console.log('Form Data:', formData);
    } else {
      console.error('Validation Errors:', errors);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {generateFields(schema, formData, setFormData)}
      <Button type="submit" color="primary" variant="contained" disabled={!Object.keys(errors).length === 0}>
        Submit
      </Button>
      {Object.keys(errors).length > 0 && (
        <div style={{ color: 'red' }}>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
};

export default SchemaForm;
