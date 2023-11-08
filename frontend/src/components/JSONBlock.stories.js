import JSONBlock from './JSONBlock';

// This default export determines where your story goes in the story list.
export default {
  title: 'Doc Detective/JSONBlock',
  component: JSONBlock,
  // args at the component level for all stories.
  args: {
    object: {
      foo: "bar",
    },
    multiline: true,
  }
};

export const MultiLine = {}
export const SingleLine = {
  // args at the story level override default args for the component.
  args: {
    multiline: false,
  }
}