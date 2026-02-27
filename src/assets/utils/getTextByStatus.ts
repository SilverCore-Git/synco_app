const getTextByStatus = (status: string) => {

    switch (status) 
    {
        case 'online': return 'En ligne';
        case 'idle': return 'Absent';
        case 'dnd': return 'Ne pas déranger';
        default: return 'Hors ligne';
    }

}

export default getTextByStatus;