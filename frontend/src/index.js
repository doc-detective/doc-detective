import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import config_v2 from 'doc-detective-common/src/schemas/output_schemas/config_v2.schema.json';
import validator from '@rjsf/validator-ajv8';
import Form from '@rjsf/mui';
import FileUploader from './FileUploader';
import TestButton from './Button';

const uiSchema = {}

const log = (type) => console.log.bind(console, type);
ReactDOM.render(
  <div>
    <TestButton />
    <FileUploader />
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
