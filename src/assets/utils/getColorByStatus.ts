const getColorByStatus = (status: string) => {

    switch (status) {
        case 'online': return 'bg-green-500';
        case 'idle': return 'bg-yellow-500';
        case 'dnd': return 'bg-red-500';
        default: return 'bg-gray-500';
    }

}

export default getColorByStatus;