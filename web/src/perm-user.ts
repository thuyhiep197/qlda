/** Quyền cấp thêm riêng cho người dùng = các quyền đã tích nhưng không có trong nhóm (quyền nhóm không cần ghi riêng) */
export const extraPerms = (group: Set<string>, ticked: Iterable<string>) => [...new Set(ticked)].filter((p) => !group.has(p)).sort();
