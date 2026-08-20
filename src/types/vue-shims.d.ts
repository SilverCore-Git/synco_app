import 'vue';

declare module 'vue' {
    interface ComponentCustomProperties {
        $p: <T>(name: T) => T extends string ? string : T;
    }
}
