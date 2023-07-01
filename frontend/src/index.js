import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import config_v2 from 'doc-detective-common/src/schemas/output_schemas/config_v2.schema.json';
import validator from '@rjsf/validator-ajv8';
import Form from '@rjsf/mui';
import Button from '@mui/material/Button';
import FileUploader from './FileUploader';

const schema = {
  title: 'Todo',
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string', title: 'Title', default: 'A new task' },
    done: { type: 'boolean', title: 'Done?', default: false },
  },
};

const uiSchema = {}

const log = (type) => console.log.bind(console, type);
ReactDOM.render(
  <div>
    <FileUploader />
    <Button variant="contained">Hello World</Button>
    <Form
      schema={config_v2}
      uiSchema={uiSchema}
      validator={validator}
      onChange={log('changed')}
      onSubmit={log('submitted')}
      onError={log('errors')}
    />
  </div>,
  document.getElementById('root')
);
