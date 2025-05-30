<template>
  <div :data-test="toValue('hello')" />
</template>

<script>
export default { name: "App" };
</script>

<script setup lang="ts">
import { toValue, ref, type Ref } from "vue";
defineProps<{ msg: string }>();
const msg: Ref<number> = ref(1);
</script>

<style scoped>
#main {
  .foo {
    color: --var-red;
  }
}
</style>
