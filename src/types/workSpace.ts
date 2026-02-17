export type ThreadType = 'text' | 'vocal';

export interface Thread {
    id: string;
    categoryId: string;
    index: number;
    name: string;
    type: ThreadType;
}

export interface Category {
    id: string;
    index: number;
    name: string;
}

export interface WorkSpace {
    id: string;
    org_id: string;
    name: string;
    logo: string; // bi | http
    
    categories: Category[];
    threads: Thread[];

}