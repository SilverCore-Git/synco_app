import 'vue';

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<{}, {}, any>;
    export default component;
}

declare module 'vue' {
    interface ComponentCustomProperties {
        $p: <T>(name: T) => T extends string ? string : T;
    }
}
