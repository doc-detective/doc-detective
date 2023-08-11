import AppBar from "./components/AppBar";

const uiSchema = {}

const log = (type) => console.log.bind(console, type);
ReactDOM.render(
  <div>
    <AppBar />
    <div class="body">
    <Form
      schema={checkLink_v2}
      uiSchema={uiSchema}
      validator={validator}
      onChange={log('changed')}
      onSubmit={log('submitted')}
      onError={log('errors')}
    />
    </div>
  </div>,
  document.getElementById('root')
);
