import axios from "axios";
import { load } from "cheerio";
import { sqlConnection, sequelize } from "../../database/connection.js";
import { QueryTypes } from "sequelize";
import catchAsync from "../../utils/catchAsync.js";
import * as dotenv from "dotenv";
dotenv.config();
const DB_NAME = process.env.DB_NAME;

const sql = await sqlConnection(DB_NAME);

const novelHomepage = "https://freewebnovel.com/";
const mostPopularNovelsUrl = "https://freewebnovel.com/most-popular-novels/";

async function getData(url) {
    try {
        const { data: html } = await axios.get(url, {
            timeout: 10000,
        });

        return html;
    } catch (err) {
        throw err;
    }
}

export const getAuthor = async (novel_title) => {
    const title = novel_title || "keyboard-immortal-novel";
    const url = `https://freewebnovel.com/${title}.html`;
    console.log(url);
    let path = ".txt span[title='Author']";
    const res = await getData(url);
    const $ = load(res);
    let author =
        $(path)
            .next(".right")
            .text()
            .split(",")
            .map((x) => x.trim()) || [];

    return author;
};

const novelData = [];

export const mostPopularNovelsUrlData = async () => {
    try {
        const query =
            "select nt.id,nt.title, group_concat(gt.title  separator ',') as genre, nt.url_parameter,nt.chapters,nt.image_link,nt.link from novel_tbl nt left join genre_novel_tbl gnt on nt.id =gnt.novel_id left join genre_tbl gt on gt.id =gnt.genre_id group by nt.id,nt.title ;";
        const results = await sequelize.query(query, {
            type: QueryTypes.SELECT,
        });
        return results;
    } catch (err) {
        throw err;
    }
};

export const getNovelWithTitle = async (novel_title, page_index) => {
    // novel_title = "keyboard-immortal-novel";
    const pageIndex =
        page_index == null ||
        page_index === 0 ||
        typeof page_index !== "number" ||
        isNaN(page_index)
            ? 1
            : page_index;
    const limit = 40;
    const startPageIndex = (pageIndex - 1) * limit; //40
    const endPageIndex = pageIndex * limit; //80

    const url = `https://freewebnovel.com/${novel_title}/${pageIndex}.html`;
    const res = await getData(url);
    console.log(url);
    const $ = load(res);
    const genre = [];
    const author = [];
    var status = "";
    var title = "";
    var description = "";
    const chaptersArray = [];
    const results = {};
    let lastPage = 0;

    $(".row-box > .col-content").each((_, items) => {
        $(items)
            .find(".m-book1 > div")
            .each((_, x) => {
                console.log($(x).html());
                // FETCH AUTHOR NAME:
                $(x)
                    .find(".m-imgtxt .txt div:nth-child(2) .right a")
                    .each((i, y) => (author[i] = $(y).text()));
                // FETCH GENRE LIST:
                $(x)
                    .find(".m-imgtxt .txt div:nth-child(3) .right a")
                    .each((i, z) => (genre[i] = $(z).text()));
                // FETCH NOVEL STATUS:
                $(x)
                    .find(".m-imgtxt .txt div:nth-child(6) .right .s1.s2 a")
                    .map((i, za) => (status = $(za).text()));
                //FETCH TITLE:
                $(x)
                    .find(".m-desc .tit")
                    .map((i, x) => (title = $(x).text()));
                //FETCH NOVEL DESCRIPTION:
                $(x)
                    .find(".m-desc .txt >.inner ")
                    .each(
                        (i, x) =>
                            (description = description.concat($(x).text()))
                    );
            });
    });

    //GET LAST PAGE FOR THE LATEST CHAPTER NUMBER
    //AND FETCH ALL CHAPTERS TILL LATEST

    async function scrape() {
        return new Promise(async (resolve, reject) => {
            try {
                $(".row-box .col-content .m-newest2 > .page").each(
                    (i, chapters) => {
                        $(chapters)
                            .find("a:last-child")
                            .each(async (_, x) => {
                                lastPage = parseInt(
                                    $(x).attr("href").split("/").length >= 3
                                        ? $(x)
                                              .attr("href")
                                              .split("/")[2]
                                              .split(".")[0]
                                        : 1
                                );
                                console.time("time taken");
                                for (let i = pageIndex; i <= pageIndex; i++) {
                                    const url = `https://freewebnovel.com/${novel_title}/${i}.html`;

                                    const inner$ = load(await getData(url));

                                    inner$(
                                        ".row-box .col-content .m-newest2 > .ul-list5 "
                                    ).each((i, chapters) => {
                                        let obj = {};
                                        inner$(chapters)
                                            .find("li a")
                                            .each((i, x) => {
                                                obj = {
                                                    chapter: inner$(x)
                                                        .text()
                                                        .split(/\:|-/)[0],
                                                    title: inner$(x)
                                                        .text()
                                                        .split(/\:|-/)[1],
                                                    url: inner$(x).attr("href"),
                                                };

                                                chaptersArray.push(obj);
                                            });
                                    });
                                }

                                resolve(chaptersArray);

                                console.timeEnd("time taken");
                            });
                    }
                );
            } catch (err) {
                reject(err);
            }
        });
    }

    const novelChapters = await scrape();

    // console.log("after push:", chaptersArray.length);
    console.log("pageIndex:", pageIndex);
    console.log("lastpage:", lastPage);
    if (pageIndex < parseInt(lastPage)) {
        results.next = { page: pageIndex + 1, limit: limit };
    }
    if (startPageIndex > 0) {
        if (!(pageIndex >= parseInt(lastPage))) {
            results.previous = { page: pageIndex - 1, limit: limit };
        } else
            results.previous = { page: parseInt(lastPage) - 1, limit: limit };
    }
    results.title = title;
    results.url = `/${novel_title}.html`;
    results.status = status;
    results.genre = genre;
    results.author = author;
    results.description = description;
    results.results = chaptersArray;

    return results;
};

export const getChapter = async (novel_title, ch_no) => {
    // novel_title = "emperors-domination";
    ch_no = parseInt(ch_no);
    const is_match = /^\d+$/.test(ch_no);
    const chapter_number = is_match && !isNaN(ch_no) ? ch_no : 1;

    const url = `https://freewebnovel.com/${novel_title}/chapter-${chapter_number}.html`;
    console.log("get_novel_chapter:", url);
    const res = await getData(url);
    const $ = load(res);

    let chapter = "";
    const prev_selector = $(
        "#main1 > div > div > div.top > .ul-list7 > li a"
    ).attr("href");
    const next_selector = $(
        "#main1 > div > div > div.top > ul > li:nth-child(4) > a"
    ).attr("href");

    const previous =
        prev_selector?.split("/").length >= 4
            ? Number(prev_selector.split("/")[3].split(".")[0].split("-")[1])
            : null;
    const next =
        next_selector?.split("/").length >= 4
            ? Number(next_selector.split("/")[3].split(".")[0].split("-")[1])
            : null;

    $(".m-read .wp .txt #article>p").each((i, x) => {
        chapter += $(x).text();
    });

    if (chapter.length <= 0) {
        return {
            success: false,
            next,
            previous,
            chapter:
                "Chapter content is missing or does not exist! Please try again later!",
        };
    }
    return { success: true, next, previous, chapter };
};

//RECOMMENDATIONS
export const getKnnRecommendation = async (novel_id, title = "") => {
    try {
        // Sample dataset of novels and their associated genres (dummy data)
        const is_array = novel_id && Array.isArray(novel_id);

        const sample_dataset = [
            { novel_id: "Mystery Mansion", genres: ["Mystery", "Thriller"] },
        ];

        async function fetchAllNovels() {
            // const query =
            //     "select nt.id as novel_id, group_concat(gnt.genre_id separator ',') as genre from novel_tbl nt left join genre_novel_tbl gnt on nt.id =gnt.novel_id group by nt.id,nt.title ;";
            const query =
                "select nt.id as novel_id,nt.title,nt.chapters ,nt.image_link ,nt.url_parameter, group_concat(gt.title  separator ',') as genre from novel_tbl nt left join genre_novel_tbl gnt on nt.id =gnt.novel_id left join genre_tbl gt on gt.id =gnt.genre_id group by nt.id;";
            const get_novel_with_matching_genre = await sql
                .query(query)
                .then((res) =>
                    res[0].map((row) => ({
                        // genre: row.genre.split(",").map((x) => Number(x)),
                        novel_id: row.novel_id,
                        title: row.title,
                        chapters: row.chapters,
                        image_link: row.image_link,
                        url_parameter: row.url_parameter,
                        genre: row.genre.split(",").map((x) => x.trim()),
                    }))
                );

            return get_novel_with_matching_genre;
        }

        const dataset = await fetchAllNovels();

        async function fetch_novel_genre(novel_id, title) {
            // const query = `select * from genre_novel_tbl where novel_id=${novel_id} order by genre_id`;
            const query = `select gnt.novel_id ,gt.title as genre_title from genre_novel_tbl gnt left join genre_tbl gt on gnt.genre_id  =gt.id where novel_id=${novel_id} order by genre_id;`;
            const res = await sql.query(query);
            // return res[0].map((row) => row.genre_id);
            return res[0].map((row) => row.genre_title);
        }

        // Function to calculate Euclidean distance between two sets of genres
        function euclideanDistance(set1, set2) {
            //set 1 is dataset genre
            const allGenres = new Set([...set1, ...set2]);

            let sum = 0;
            for (const genre of allGenres) {
                const presence1 = set1.has(genre) ? 1 : 0;
                const presence2 = set2.has(genre) ? 1 : 0;
                sum += Math.pow(presence1 - presence2, 2);
            }

            const t = Math.sqrt(sum);
            return 1 / (1 + t);
        }

        // k-Nearest Neighbors algorithm for genre-based recommendation using Euclidean distance
        function recommendNovelsByGenre(targetGenre, k, id) {
            // Calculate distances from targetGenre to all data points
            let distances = [];
            if (!is_array) {
                distances = dataset
                    .filter((x) => x.novel_id !== id)
                    .map((data) => ({
                        novel_id: data.novel_id,
                        distance: euclideanDistance(
                            new Set(data.genre),
                            new Set(targetGenre)
                        ),
                    }));
            }
            if (is_array) {
                distances = dataset
                    .filter((x) => x.url_parameter !== id)
                    .map((data) => {
                        // console.log(data);
                        return {
                            novel_id: data.novel_id,
                            distance: euclideanDistance(
                                new Set(data.genre),
                                new Set(targetGenre)
                            ),
                        };
                    });
            }

            // Sort distances in ascending order
            distances.sort((a, b) => b.distance - a.distance);
            // console.log(distances);

            // Select the first 'k' neighbors
            const nearestNeighbors = distances.slice(0, k);

            // Return recommended novels
            const recommendedNovels = nearestNeighbors.map((neighbor) => {
                // console.log(neighbor);
                return neighbor;
            });

            return recommendedNovels;
        }

        // USAGE
        const k = 10; // Number of neighbors to consider for recommendation
        let recommendedNovels;
        if (!is_array) {
            const main_novel_id = novel_id || 1;
            const providedGenre = await fetch_novel_genre(main_novel_id, title); // Provided genre for the novel

            recommendedNovels = recommendNovelsByGenre(
                providedGenre,
                k,
                main_novel_id
            );
        }
        if (is_array) {
            const providedGenre = novel_id; // Provided genre array for the novel
            recommendedNovels = recommendNovelsByGenre(providedGenre, k, title);
        }

        // Filter Dataset With Only Recommended Novels Remaining
        // Then Merge The Recommendednovels Array With Filtered Dataset
        const filteredDataset = dataset.filter((obj) =>
            recommendedNovels?.some((item) => item.novel_id === obj.novel_id)
        );
        const mergedArray = filteredDataset.map((obj) => ({
            ...obj,
            ...recommendedNovels.find((item) => item.novel_id === obj.novel_id),
        }));
        mergedArray.sort((a, b) => b.distance - a.distance);
        return mergedArray;
    } catch (err) {
        throw err;
    }
};
