export type OrgConfig = {
    maxNotesPerSpace: number;
    maxFileStoragePerSpace: number; // mo
    maxUsersPerSpace: number;
    maxTotalUsers: number;
}

export type OrgStats = {
    memberCount: number;
    onlineCount: number;
}


export interface Org {

    id: string;
    name: string;
    logo: string;

    stats: OrgStats;
    config: OrgConfig;

}

