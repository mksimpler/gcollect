declare interface Href {
    text: string,
    url: string
}

declare interface TypedJson {
    __type__: string
}

declare interface SearchResult extends TypedJson {
    url: string,
    queryString: string,
    results: Human[] | Movie[]
}