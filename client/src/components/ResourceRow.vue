<script setup>
const props = defineProps({
  resource: {
    type: Object,
    required: true
  },
  resolveIconUrl: {
    type: Function,
    required: true
  },
  onIconError: {
    type: Function,
    required: true
  },
  onDelete: {
    type: Function,
    required: false
  }
})

function shouldScrollTitle(name) {
  if (!name) return false
  return name.length > 12
}

function handleDelete() {
  if (props.onDelete) {
    props.onDelete(
      props.resource.planet_id,
      props.resource.system_id,
      props.resource.resource_id,
      props.resource.resource_name
    )
  }
}
</script>

<template>
  <li class="resource-row">
    <div class="resource-card">
      <div class="resource-card-title" :class="{ scrolling: shouldScrollTitle(props.resource.resource_name) }">
        <div class="resource-card-title-text">{{ props.resource.resource_name }}</div>
      </div>
      <div class="resource-card-icon" :style="{ background: props.resource.iconColor || '#111' }">
        <img
          v-if="props.resource.iconUrl"
          :src="props.resolveIconUrl(props.resource.iconUrl)"
          :alt="props.resource.resource_name"
          @error="props.onIconError(props.resource)"
        />
        <span v-else>{{ props.resource.resource_name.slice(0, 2).toUpperCase() }}</span>
      </div>
    </div>
    <div class="resource-body">
      <div class="resource-title">
        <strong>{{ props.resource.resource_name }}</strong>
        <span v-if="props.resource.category" class="resource-tag">{{ props.resource.category }}</span>
      </div>
      <div class="resource-meta">
        <span v-if="props.resource.planet_name">{{ props.resource.system_name }} / {{ props.resource.planet_name }}</span>
        <span v-else>System: {{ props.resource.system_name }}</span>
      </div>
      <div v-if="props.resource.notes" class="note">{{ props.resource.notes }}</div>
    </div>
    <div class="resource-badges">
      <span v-if="props.resource.location_type === 'system'" class="resource-pill">System</span>
      <span v-if="props.resource.hotspot_type" class="resource-pill">{{ props.resource.hotspot_type }}</span>
      <span v-if="props.resource.quantity" class="resource-pill">{{ props.resource.quantity }}</span>
    </div>
    <button
      v-if="props.onDelete"
      class="danger"
      type="button"
      @click="handleDelete"
      title="Delete this resource"
    >
      ✕
    </button>
  </li>
</template>
