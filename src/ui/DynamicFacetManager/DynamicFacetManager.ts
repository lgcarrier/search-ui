import { Component } from '../Base/Component';
import { InitializationEvents } from '../../events/InitializationEvents';
import { QueryEvents, IQuerySuccessEventArgs, IDoneBuildingQueryEventArgs } from '../../events/QueryEvents';
import { exportGlobally } from '../../GlobalExports';
import { find, without, partition } from 'underscore';
import { IFacetResponse } from '../../rest/Facet/FacetResponse';
import { $$ } from '../../utils/Dom';
import { Utils } from '../../utils/Utils';
import { ComponentOptions } from '../Base/ComponentOptions';
import { Assert } from '../../misc/Assert';
import { Initialization } from '../Base/Initialization';
import { ComponentsTypes } from '../../utils/ComponentsTypes';
import { QueryBuilder } from '../Base/QueryBuilder';
import { IAutoLayoutAdjustableInsideFacetColumn } from '../SearchInterface/FacetColumnAutoLayoutAdjustment';

export interface IDynamicFacetManagerOptions {
  enableReorder?: boolean;
  onUpdate?: IDynamicFacetManagerOnUpdate;
  compareFacets?: IDynamicFacetManagerCompareFacet;
  maximumNumberOfExpandedFacets?: number;
}

export interface IDynamicFacetManagerOnUpdate {
  (facet: IDynamicManagerCompatibleFacet, index: number): void;
}

export interface IDynamicFacetManagerCompareFacet {
  (facetA: IDynamicManagerCompatibleFacet, facetB: IDynamicManagerCompatibleFacet): number;
}

export interface IDynamicManagerCompatibleFacet extends Component, IAutoLayoutAdjustableInsideFacetColumn {
  dynamicFacetManager: DynamicFacetManager;
  hasDisplayedValues: boolean;
  hasActiveValues: boolean;
  isDynamicFacet: boolean;

  putStateIntoQueryBuilder(queryBuilder: QueryBuilder): void;
  putStateIntoAnalytics(): void;
  expand(): void;
  collapse(): void;
}

/**
 * The `DynamicFacetManager` component is meant to be a parent for multiple [DynamicFacet]{@link DynamicFacet} & [DynamicFacetRange]{@link DynamicFacetRange} components.
 * This component allows controlling a set of [`DynamicFacet`]{@link DynamicFacet} and [`DynamicFacetRange`]{@link DynamicFacetRange} as a group.
 *
 * See [Using Dynamic Facets](https://docs.coveo.com/en/2917/).
 */
export class DynamicFacetManager extends Component {
  static ID = 'DynamicFacetManager';
  static doExport = () => exportGlobally({ DynamicFacetManager });

  /**
   * The options for the DynamicFacetManager
   * @componentOptions
   */
  static options: IDynamicFacetManagerOptions = {
    /**
     * Whether to allow the reordering of facets based on Coveo ML and index ranking scores.
     *
     * **Default:** `true`
     */
    enableReorder: ComponentOptions.buildBooleanOption({ defaultValue: true, section: 'Filtering' }),
    /**
     * A function to execute whenever facets are updated in the query response (see [Implementing Custom Dynamic Facet Behaviors](https://docs.coveo.com/en/2902/#implementing-custom-dynamic-facet-behaviors)).
     *
     * **Note:**
     * > You cannot set this option directly in the component markup as an HTML attribute. You must either set it in the
     * > [`init`]{@link init} call of your search interface (see
     * > [Components - Passing Component Options in the init Call](https://developers.coveo.com/x/PoGfAQ#Components-PassingComponentOptionsintheinitCall)),
     * > or before the `init` call, using the `options` top-level function (see
     * > [Components - Passing Component Options Before the init Call](https://developers.coveo.com/x/PoGfAQ#Components-PassingComponentOptionsBeforetheinitCall)).
     */
    onUpdate: ComponentOptions.buildCustomOption<IDynamicFacetManagerOnUpdate>(() => {
      return null;
    }),
    /**
     * A custom sort function to execute on facets on every successful query response (see [Implementing a Custom Dynamic Facet Sort Function](https://docs.coveo.com/en/2902/#implementing-a-custom-dynamic-facet-sort-function)).
     *
     * **Note:**
     * > If specified, the function must implement the JavaScript compareFunction (see [Array.prototype.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort).
     * > You cannot set this option directly in the component markup as an HTML attribute. You must either set it in the
     * > [`init`]{@link init} call of your search interface (see
     * > [Components - Passing Component Options in the init Call](https://developers.coveo.com/x/PoGfAQ#Components-PassingComponentOptionsintheinitCall)),
     * > or before the `init` call, using the `options` top-level function (see
     * > [Components - Passing Component Options Before the init Call](https://developers.coveo.com/x/PoGfAQ#Components-PassingComponentOptionsBeforetheinitCall)).
     */
    compareFacets: ComponentOptions.buildCustomOption<IDynamicFacetManagerCompareFacet>(() => {
      return null;
    }),
    /**
     * The maximum number of expanded facets inside the manager.
     * Remaining facets are collapsed.
     *
     * **Note:**
     * Prioritizes facets with active values, and then prioritizes first facets.
     * If the number of facets with active values exceeds the value of the `maximumNumberOfExpandedFacets` option, it overrides the option.
     *
     * Using the value `-1` disables the feature and keeps all facets expanded.
     *
     * **Default:** `4`
     */
    maximumNumberOfExpandedFacets: ComponentOptions.buildNumberOption({ defaultValue: 4, min: -1 })
  };

  private childrenFacets: IDynamicManagerCompatibleFacet[] = [];
  private containerElement: HTMLElement;

  private get enabledFacets() {
    return this.childrenFacets.filter(facet => !facet.disabled);
  }

  private get facetsWithDisplayedValues() {
    return this.childrenFacets.filter(facet => facet.hasDisplayedValues);
  }

  /**
   * Creates a new `DynamicFacetManager` instance.
   *
   * @param element The element from which to instantiate the component.
   * @param options The component options.
   * @param bindings The component bindings. Automatically resolved by default.
   */
  constructor(element: HTMLElement, public options?: IDynamicFacetManagerOptions) {
    super(element, 'DynamicFacetManager');
    this.options = ComponentOptions.initComponentOptions(element, DynamicFacetManager, options);

    this.moveChildrenIntoContainer();
    this.initEvents();
  }

  private resetContainer() {
    this.containerElement && $$(this.containerElement).remove();
    this.containerElement = $$('div', { className: 'coveo-dynamic-facet-manager-container' }).el;
  }

  private moveChildrenIntoContainer() {
    this.resetContainer();
    $$(this.element)
      .children()
      .forEach(child => this.containerElement.appendChild(child));
    this.element.appendChild(this.containerElement);
  }

  private initEvents() {
    this.bind.onRootElement(InitializationEvents.afterComponentsInitialization, () => this.handleAfterComponentsInitialization());
    this.bind.onRootElement(QueryEvents.doneBuildingQuery, (data: IDoneBuildingQueryEventArgs) => this.handleDoneBuildingQuery(data));
    this.bind.onRootElement(QueryEvents.querySuccess, (data: IQuerySuccessEventArgs) => this.handleQuerySuccess(data));
  }

  private isDynamicFacet(component: Component) {
    return !!(component as IDynamicManagerCompatibleFacet).isDynamicFacet
  }

  private get allDynamicFacets(): IDynamicManagerCompatibleFacet[] {
    const allFacetsInComponent = ComponentsTypes.getAllFacetsInstance(this.element);
    return <IDynamicManagerCompatibleFacet[]>allFacetsInComponent.filter(this.isDynamicFacet);
  }

  private handleAfterComponentsInitialization() {
    this.childrenFacets = this.allDynamicFacets;
    this.childrenFacets.forEach(dynamicFacet => (dynamicFacet.dynamicFacetManager = this));

    if (!this.childrenFacets.length) {
      this.disable();
    }
  }

  private handleDoneBuildingQuery(data: IDoneBuildingQueryEventArgs) {
    Assert.exists(data);
    Assert.exists(data.queryBuilder);

    this.enabledFacets.forEach(dynamicFacet => {
      dynamicFacet.putStateIntoQueryBuilder(data.queryBuilder);
      dynamicFacet.putStateIntoAnalytics();
    });
  }

  private handleQuerySuccess(data: IQuerySuccessEventArgs) {
    if (Utils.isNullOrUndefined(data.results.facets)) {
      return this.notImplementedError();
    }

    if (this.options.enableReorder) {
      this.mapResponseToComponents(data.results.facets);
      this.sortFacetsIfCompareOptionsProvided();
      this.reorderDynamicFacetsInDom();
    }
  }

  private mapResponseToComponents(facetsResponse: IFacetResponse[]) {
    const facetsInResponse = facetsResponse.map(({ facetId }) => this.getFacetComponentById(facetId)).filter(Utils.exists);
    const facetsNotInResponse = without(this.childrenFacets, ...facetsInResponse);

    facetsInResponse.forEach(facet => facet.enable());

    this.childrenFacets = [...facetsInResponse, ...facetsNotInResponse];
  }

  private sortFacetsIfCompareOptionsProvided() {
    if (this.options.compareFacets) {
      this.childrenFacets = this.childrenFacets.sort(this.options.compareFacets);
    }
  }

  private reorderDynamicFacetsInDom() {
    this.resetContainer();
    const fragment = document.createDocumentFragment();

    this.childrenFacets.forEach((dynamicFacet, index) => {
      fragment.appendChild(dynamicFacet.element);

      if (this.options.onUpdate) {
        this.options.onUpdate(dynamicFacet, index);
      }
    });

    this.respectMaximumExpandedFacetsThreshold();

    this.containerElement.appendChild(fragment);
    this.element.appendChild(this.containerElement);
  }

  private respectMaximumExpandedFacetsThreshold() {
    if (this.options.maximumNumberOfExpandedFacets === -1) {
      return;
    }

    const [collapsableFacets, uncollapsableFacets] = partition(this.facetsWithDisplayedValues, facet => facet.options.enableCollapse);
    const [facetsWithActiveValues, remainingFacets] = partition(collapsableFacets, facet => facet.hasActiveValues);
    const indexOfFirstFacetToCollapse =
      this.options.maximumNumberOfExpandedFacets - uncollapsableFacets.length - facetsWithActiveValues.length;

    facetsWithActiveValues.forEach(dynamicFacet => dynamicFacet.expand());

    remainingFacets.forEach((dynamicFacet, index) => {
      index < indexOfFirstFacetToCollapse ? dynamicFacet.expand() : dynamicFacet.collapse();
    });
  }

  private getFacetComponentById(id: string) {
    const facet = find(this.childrenFacets, facet => facet.options.id === id);

    if (!facet) {
      this.logger.error(`Cannot find facet component with an id equal to "${id}".`);
      return null;
    }

    return facet;
  }

  private notImplementedError() {
    this.logger.error('DynamicFacetManager is not supported by your current search endpoint. Disabling this component.');
    this.disable();
  }

  public isCurrentlyDisplayed() {
    return !!find(this.childrenFacets, facet => facet.isCurrentlyDisplayed());
  }
}

Initialization.registerAutoCreateComponent(DynamicFacetManager);
DynamicFacetManager.doExport();
