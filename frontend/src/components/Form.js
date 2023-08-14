import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import checkLink_v2 from "doc-detective-common/src/schemas/output_schemas/checkLink_v2.schema.json";

const Form = () => {

    const generateFormFields = (schema) => {
        const formFields = [];

        for (const [key, value] of Object.entries(schema.properties)) {
            let field;

            switch (value.type) {
                case 'string':
                    field = <TextField label={key} />;
                    break;
                case 'boolean':
                    field = <Checkbox label={key} />;
                    break;
                case 'integer':
                    field = (
                        <Select label={key}>
                            {value.enum.map((option) => (
                                <MenuItem value={option}>{option}</MenuItem>
                            ))}
                        </Select>
                    );
                    break;
                default:
                    if (value.properties) {
                        field = generateFormFields(value);
                    }
                    break;
            }

            if (field) {
                formFields.push(field);
            }
        }

        return formFields;
    }

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [fields, setFields] = useState([{ value: null }]);

    const handleSubmit = (event) => {
        event.preventDefault();
        console.log(`Name: ${name}\nEmail: ${email}\nMessage: ${message}`);
    };

    const handleAddField = () => {
        const values = [...fields];
        values.push({ value: null });
        setFields(values);
    };

    const handleFieldChange = (index, event) => {
        const values = [...fields];
        values[index].value = event.target.value;
        setFields(values);
    };

    const formFields = generateFormFields(checkLink_v2);

    return (
        <form onSubmit={handleSubmit}>
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
            {formFields.map((field) => (
                field
            ))}
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
