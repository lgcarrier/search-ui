import * as Mock from '../MockEnvironment';
import { IBasicComponentSetup } from '../MockEnvironment';
import { QuerySuggestPreview, IQuerySuggestPreview } from '../../src/ui/QuerySuggestPreview/QuerySuggestPreview';
import { IOmniboxAnalytics } from '../../src/ui/Omnibox/OmniboxAnalytics';
import { $$, HtmlTemplate, Component } from '../../src/Core';
import { FakeResults } from '../Fake';
import { IAnalyticsOmniboxSuggestionMeta, analyticsActionCauseList } from '../../src/ui/Analytics/AnalyticsActionListMeta';
import { IQueryResults } from '../../src/rest/QueryResults';
import { last } from 'underscore';
import { IPopulateSearchResultPreviewsEventArgs, ResultPreviewsManagerEvents } from '../../src/events/ResultPreviewsManagerEvents';

export function initOmniboxAnalyticsMock(omniboxAnalytics: IOmniboxAnalytics) {
  const partialQueries: string[] = [];
  let suggestionRanking: number;
  const suggestions: string[] = [];
  let partialQuery: string;
  const buildCustomDataForPartialQueries = (): IAnalyticsOmniboxSuggestionMeta => {
    return getMetadata(omniboxAnalytics);
  };
  return (omniboxAnalytics = {
    partialQueries,
    suggestionRanking,
    suggestions,
    partialQuery,
    buildCustomDataForPartialQueries
  });
}

function getMetadata(omniboxAnalytics: IOmniboxAnalytics) {
  return {
    suggestionRanking: omniboxAnalytics.suggestionRanking,
    suggestions: omniboxAnalytics.suggestions.join(';'),
    partialQueries: omniboxAnalytics.partialQueries.join(';'),
    partialQuery: last(omniboxAnalytics.partialQuery)
  };
}

export function QuerySuggestPreviewTest() {
  describe('QuerySuggestPreview', () => {
    let test: IBasicComponentSetup<QuerySuggestPreview>;
    let testEnv: Mock.MockEnvironmentBuilder;
    let omniboxAnalytics: IOmniboxAnalytics;

    const templateClassName = 'test-template';
    function setupQuerySuggestPreview(options: IQuerySuggestPreview = {}, useCustomTemplate = true) {
      if (useCustomTemplate) {
        options.resultTemplate = HtmlTemplate.create(
          $$('script', { className: 'result-template', type: 'text/html' }, $$('div', { className: templateClassName })).el
        );
      }

      test = Mock.advancedComponentSetup<QuerySuggestPreview>(
        QuerySuggestPreview,
        new Mock.AdvancedComponentSetupOptions(null, options, env => testEnv)
      );
      spyOn(Component, 'resolveRoot').and.returnValue(testEnv.root);
    }

    function triggerPopulateSearchResultPreviews(suggestionText: string = 'test', fakeResults?: IQueryResults) {
      fakeResults = fakeResults || FakeResults.createFakeResults(test.cmp.options.numberOfPreviewResults);
      (test.env.searchEndpoint.search as jasmine.Spy).and.returnValue(Promise.resolve(fakeResults));
      const event: IPopulateSearchResultPreviewsEventArgs = { suggestionText, previewsQueries: [] };
      $$(testEnv.root).trigger(ResultPreviewsManagerEvents.populateSearchResultPreviews, event);
      return event.previewsQueries[0];
    }

    function triggerPopulateSearchResultPreviewsAndPassTime(suggestion: string = 'test', fakeResults?: IQueryResults) {
      const query = triggerPopulateSearchResultPreviews(suggestion);
      if (query instanceof Promise) {
        return query;
      }
      return Promise.resolve(query);
    }

    beforeEach(() => {
      testEnv = new Mock.MockEnvironmentBuilder();
      omniboxAnalytics = this.initOmniboxAnalyticsMock(omniboxAnalytics);
      testEnv.searchInterface.getOmniboxAnalytics = jasmine.createSpy('omniboxAnalytics').and.returnValue(omniboxAnalytics) as any;
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    describe('expose options', () => {
      it('resultTemplate sets the template', async done => {
        setupQuerySuggestPreview();
        const previews = await triggerPopulateSearchResultPreviewsAndPassTime();
        expect(previews[0].element.getElementsByClassName(templateClassName).length).toEqual(1);
        done();
      });

      it('resultTemplate has a default template', async done => {
        setupQuerySuggestPreview({}, false);
        const previews = await triggerPopulateSearchResultPreviewsAndPassTime();
        expect(previews[0].element.getElementsByClassName('coveo-default-result-preview').length).toEqual(1);
        done();
      });

      it('numberOfPreviewResults set the number of results to query', async done => {
        const numberOfPreviewResults = 5;
        setupQuerySuggestPreview({ numberOfPreviewResults });
        await triggerPopulateSearchResultPreviewsAndPassTime();
        expect(test.cmp.queryController.getLastQuery().numberOfResults).toBe(numberOfPreviewResults);
        done();
      });
    });

    describe('When we hover', () => {
      it(`and the query get executed, 
      it logs an analytics search event`, async done => {
        setupQuerySuggestPreview();
        await triggerPopulateSearchResultPreviewsAndPassTime();

        expect(test.cmp.usageAnalytics.logSearchEvent).toHaveBeenCalledWith(
          analyticsActionCauseList.showQuerySuggestPreview,
          jasmine.objectContaining(getMetadata(omniboxAnalytics))
        );
        done();
      });
    });

    describe('Analytics', () => {
      function getAnalyticsMetadata(suggestion: string) {
        return jasmine.objectContaining({
          suggestion,
          displayedRank: 0
        });
      }

      it('it log an analytics with the appropriate event', async done => {
        const suggestion = 'test';
        setupQuerySuggestPreview();
        const result = (await triggerPopulateSearchResultPreviewsAndPassTime(suggestion))[0];
        result.onSelect();
        expect(test.cmp.usageAnalytics.logCustomEvent).toHaveBeenCalledWith(
          analyticsActionCauseList.clickQuerySuggestPreview,
          getAnalyticsMetadata(suggestion),
          result.element
        );
        done();
      });

      it(`it log an analytics with the appropriate event,
      even if we hover on another suggestion before clicking`, async done => {
        const suggestion = 'test';
        setupQuerySuggestPreview();
        const result = (await triggerPopulateSearchResultPreviewsAndPassTime(suggestion))[0];
        await triggerPopulateSearchResultPreviewsAndPassTime(`bad ${suggestion}`);
        result.onSelect();
        expect(test.cmp.usageAnalytics.logCustomEvent).toHaveBeenCalledWith(
          analyticsActionCauseList.clickQuerySuggestPreview,
          getAnalyticsMetadata(suggestion),
          result.element
        );
        done();
      });
    });
  });
}
