// Supabase 客户端 - 纯 fetch 实现，无外部依赖
// 链式调用 API，尽量兼容 @supabase/supabase-js 的用法

export function createSupabaseClient(supabaseUrl, serviceRoleKey) {
  const baseUrl = `${supabaseUrl}/rest/v1`;
  const defaultHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  function createQueryBuilder(table) {
    const state = {
      table,
      selectColumns: '*',
      filters: {},
      orderColumn: null,
      orderAscending: true,
      limitCount: null,
      offsetCount: null,
      single: false,
    };

    const builder = {
      _state: state,
      select(columns = '*') {
        state.selectColumns = columns;
        return builder;
      },

      eq(column, value) {
        state.filters[column] = `eq.${value}`;
        return builder;
      },

      neq(column, value) {
        state.filters[column] = `neq.${value}`;
        return builder;
      },

      gt(column, value) {
        state.filters[column] = `gt.${value}`;
        return builder;
      },

      gte(column, value) {
        state.filters[column] = `gte.${value}`;
        return builder;
      },

      lt(column, value) {
        state.filters[column] = `lt.${value}`;
        return builder;
      },

      lte(column, value) {
        state.filters[column] = `lte.${value}`;
        return builder;
      },

      order(column, { ascending = true } = {}) {
        state.orderColumn = column;
        state.orderAscending = ascending;
        return builder;
      },

      limit(count) {
        state.limitCount = count;
        return builder;
      },

      offset(count) {
        state.offsetCount = count;
        return builder;
      },

      single() {
        state.single = true;
        return builder;
      },

      // 执行查询
      then(resolve, reject) {
        return this._execute().then(resolve, reject);
      },

      async _execute() {
        try {
          const params = new URLSearchParams();
          params.set('select', state.selectColumns);

          for (const [key, value] of Object.entries(state.filters)) {
            params.set(key, value);
          }

          if (state.orderColumn) {
            params.set('order', `${state.orderColumn}.${state.orderAscending ? 'asc' : 'desc'}`);
          }

          if (state.limitCount !== null) {
            params.set('limit', String(state.limitCount));
          }

          if (state.offsetCount !== null) {
            params.set('offset', String(state.offsetCount));
          }

          const url = `${baseUrl}/${state.table}?${params.toString()}`;
          const res = await fetch(url, { headers: defaultHeaders });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { data: null, error: err };
          }

          let data = await res.json();

          if (state.single) {
            data = Array.isArray(data) ? data[0] : data;
          }

          return { data, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
    };

    return builder;
  }

  return {
    from(table) {
      return {
        select(columns) {
          return createQueryBuilder(table).select(columns);
        },

        insert(data) {
          return {
            async then(resolve, reject) {
              try {
                const url = `${baseUrl}/${table}`;
                const res = await fetch(url, {
                  method: 'POST',
                  headers: {
                    ...defaultHeaders,
                    Prefer: 'return=representation',
                  },
                  body: JSON.stringify(data),
                });

                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  return resolve({ data: null, error: err });
                }

                const result = await res.json();
                const returnData = Array.isArray(result) ? result[0] : result;
                return resolve({ data: returnData, error: null });
              } catch (error) {
                return resolve({ data: null, error });
              }
            },
          };
        },

        update(data) {
          const builder = createQueryBuilder(table);
          builder._updateData = data;
          builder._method = 'PATCH';

          builder.then = async function (resolve, reject) {
            try {
              const params = new URLSearchParams();
              for (const [key, value] of Object.entries(builder._state.filters)) {
                params.set(key, value);
              }

              const url = `${baseUrl}/${table}?${params.toString()}`;
              const res = await fetch(url, {
                method: 'PATCH',
                headers: {
                  ...defaultHeaders,
                  Prefer: 'return=representation',
                },
                body: JSON.stringify(data),
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return resolve({ data: null, error: err });
              }

              const result = await res.json();
              return resolve({ data: result, error: null });
            } catch (error) {
              return resolve({ data: null, error });
            }
          };

          return builder;
        },

        delete() {
          const builder = createQueryBuilder(table);
          builder._method = 'DELETE';

          builder.then = async function (resolve, reject) {
            try {
              const params = new URLSearchParams();
              for (const [key, value] of Object.entries(builder._state.filters)) {
                params.set(key, value);
              }

              const url = `${baseUrl}/${table}?${params.toString()}`;
              const res = await fetch(url, {
                method: 'DELETE',
                headers: defaultHeaders,
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return resolve({ data: null, error: err });
              }

              return resolve({ data: null, error: null });
            } catch (error) {
              return resolve({ data: null, error });
            }
          };

          return builder;
        },
      };
    },
  };
}
