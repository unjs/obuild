import { defineComponent } from "vue";

const FooBarComponent = defineComponent({
  name: "FooBarComponent",
  inheritAttrs: false,
  props: {
    fooString: {
      type: String,
      default: () => "foo",
    },
    barNumber: {
      type: Number,
      default: () => 42,
    },
    bazBoolean: {
      type: Boolean,
      default: () => true,
    },
    quxArray: {
      type: Array,
      default: () => [],
    },
    quuxObject: {
      type: Object,
      default: () => ({}),
    },
  },
  emits: {
    "foo-bar-event"(_payload: unknown) {
      return true;
    },
  },
});

export default FooBarComponent;
