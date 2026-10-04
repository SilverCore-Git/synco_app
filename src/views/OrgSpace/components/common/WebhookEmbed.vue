<template>
    <div class="flex flex-col gap-2 mt-2 w-full max-w-[500px]">
        <div 
            v-for="(embed, index) in embeds" 
            :key="'embed-' + index"
            class="flex flex-col border-l-[4px] rounded-md bg-black/20 p-3.5 overflow-hidden"
            :style="{ borderLeftColor: embed.color ? (typeof embed.color === 'string' && embed.color.startsWith('#') ? embed.color : `#${embed.color.toString(16).padStart(6, '0')}`) : '#7c3aed' }"
        >
            <div v-if="embed.author" class="flex items-center gap-2 mb-2">
                <img v-if="embed.author.icon_url" :src="embed.author.icon_url" loading="lazy" decoding="async" class="w-5 h-5 rounded-full" />
                <span class="text-xs font-semibold text-(--text)">{{ $p(embed.author.name) }}</span>
            </div>

            <div v-if="embed.title" class="font-bold text-sm text-(--text) mb-1">
                <a v-if="embed.url" :href="embed.url" target="_blank" class="hover:underline text-(--primary)">{{ embed.title }}</a>
                <span v-else>{{ embed.title }}</span>
            </div>

            <div v-if="embed.description" class="mb-2">
                <MarkdownRender :content="embed.description" />
            </div>

            <div v-if="embed.fields && embed.fields.length > 0" class="flex flex-wrap gap-x-4 gap-y-3 mb-2">
                <div v-for="(field, fIdx) in embed.fields" :key="'field-' + fIdx" :class="field.inline ? 'w-[calc(50%-1rem)]' : 'w-full'">
                    <div class="text-[11px] font-bold text-(--text2) mb-0.5">{{ field.name }}</div>
                    <MarkdownRender :content="field.value" />
                </div>
            </div>

            <img v-if="embed.image && embed.image.url" :src="embed.image.url" loading="lazy" decoding="async" class="rounded max-h-64 object-contain mt-2" />

            <div v-if="embed.thumbnail && embed.thumbnail.url" class="absolute top-3 right-3">
                <img :src="embed.thumbnail.url" loading="lazy" decoding="async" class="w-16 h-16 rounded object-cover" />
            </div>

            <div v-if="embed.footer" class="flex items-center gap-2 mt-2 pt-2 border-t border-(--text)/10">
                <img v-if="embed.footer.icon_url" :src="embed.footer.icon_url" loading="lazy" decoding="async" class="w-4 h-4 rounded-full" />
                <span class="text-[10px] text-(--text2)">{{ embed.footer.text }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import MarkdownRender from '@/views/OrgSpace/views/MarkdownRender.vue';

defineProps<{
    embeds: any[];
}>();
</script>
